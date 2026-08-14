import {spawnSync, execFileSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const ACTION_ENTRY = path.join(REPO_ROOT, 'lib', 'index.js');

export interface Fixture {
  /** Absolute path to the bare remote repository. */
  remote: string;
  /** Absolute path to the local clone under test. */
  local: string;
  /** Default branch name used by the fixture. */
  defaultBranch: string;
  /** Remove the fixture root directory. */
  cleanup: () => void;
}

export interface RunActionResult {
  status: number | null;
  stdout: string;
  stderr: string;
  outputs: Record<string, string>;
}

function fixtureGitEnv(
  base: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const env = {...base};
  // Husky/pre-commit and other git wrappers set GIT_* (e.g. GIT_INDEX_FILE,
  // GIT_DIR). Those must not leak into fixture repos under os.tmpdir().
  for (const key of Object.keys(env)) {
    if (key.startsWith('GIT_')) delete env[key];
  }
  return env;
}

function git(
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv = fixtureGitEnv(),
): string {
  return execFileSync('git', args, {
    cwd,
    env,
    encoding: 'utf8',
  }).trim();
}

/** Local-only identity + disable signing so fixtures work when the host has gpgsign. */
function configureFixtureRepo(repo: string, name: string, email: string) {
  git(['config', 'user.name', name], repo);
  git(['config', 'user.email', email], repo);
  git(['config', 'commit.gpgsign', 'false'], repo);
  git(['config', 'tag.gpgsign', 'false'], repo);
  // Host pull.* config must not leak into fixtures (rebase without --autostash
  // would fail once the action has staged local changes).
  git(['config', 'pull.rebase', 'false'], repo);
  git(['config', 'pull.ff', 'true'], repo);
}

/**
 * Create an isolated bare remote + local clone under os.tmpdir().
 * origin always points at the local bare path (never a network URL).
 */
export function createFixture(): Fixture {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aac-int-'));
  const remote = path.join(root, 'remote.git');
  const seed = path.join(root, 'seed');
  const local = path.join(root, 'local');

  fs.mkdirSync(remote);
  // Pin branch name in the fixture; do not read host init.defaultBranch
  // (unset on GitHub-hosted runners → git config --get exits 1).
  const defaultBranch = 'main';
  git(['init', '--bare', '-b', defaultBranch], remote);

  git(['clone', '-q', remote, seed], root);
  // Empty bare clone may leave HEAD detached; create the seed branch explicitly.
  try {
    git(['checkout', '-b', defaultBranch], seed);
  } catch {
    // Already on defaultBranch.
  }
  configureFixtureRepo(seed, 'Fixture Seed', 'seed@example.com');

  fs.writeFileSync(path.join(seed, 'README.md'), '# fixture\n');
  git(['add', 'README.md'], seed);
  git(['commit', '-q', '-m', 'Initial commit'], seed);
  git(['push', '-q', '-u', 'origin', 'HEAD'], seed);

  git(['clone', '-q', remote, local], root);
  configureFixtureRepo(local, 'Fixture Local', 'local@example.com');

  const originUrl = git(['remote', 'get-url', 'origin'], local);
  assertLocalOrigin(originUrl, remote);

  return {
    remote,
    local,
    defaultBranch,
    cleanup: () => {
      fs.rmSync(root, {recursive: true, force: true});
    },
  };
}

/** Reject network / GitHub remotes — push tests must stay on the local bare path. */
export function assertLocalOrigin(originUrl: string, expectedRemote: string) {
  const normalized = originUrl.replace(/\/$/, '');
  const expected = expectedRemote.replace(/\/$/, '');
  if (normalized !== expected) {
    throw new Error(
      'Fixture origin must be the local bare path.\n' +
        `  expected: ${expected}\n` +
        `  actual:   ${originUrl}`,
    );
  }
  if (/^https?:\/\//i.test(originUrl) || /github\.com/i.test(originUrl)) {
    throw new Error(`Refusing non-local origin URL: ${originUrl}`);
  }
}

function parseGitHubOutput(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, 'utf8');
  const outputs: Record<string, string> = {};
  let i = 0;
  const lines = content.split('\n');

  while (i < lines.length) {
    const line = lines[i];
    if (!line) {
      i++;
      continue;
    }
    const heredoc = line.match(/^([^=]+)<<(.+)$/);
    if (heredoc) {
      const [, name, delimiter] = heredoc;
      const valueLines: string[] = [];
      i++;
      while (i < lines.length && lines[i] !== delimiter) {
        valueLines.push(lines[i]);
        i++;
      }
      outputs[name] = valueLines.join('\n');
      i++; // skip delimiter
      continue;
    }
    const eq = line.indexOf('=');
    if (eq !== -1) {
      outputs[line.slice(0, eq)] = line.slice(eq + 1);
    }
    i++;
  }
  return outputs;
}

export interface ActionInputs {
  add?: string;
  allow_unsafe_git_protocols?: string;
  author_name?: string;
  author_email?: string;
  commit?: string;
  committer_name?: string;
  committer_email?: string;
  cwd?: string;
  default_author?: string;
  dry_run?: string;
  fetch?: string;
  message?: string;
  new_branch?: string;
  pathspec_error_handling?: string;
  pull?: string;
  push?: string;
  push_attempts?: string;
  remove?: string;
  tag?: string;
  tag_push?: string;
}

/**
 * Spawn the shipped action (lib/index.js) with an allowlisted environment.
 *
 * By default the child process runs with `process.cwd()` = the fixture clone
 * and `cwd: '.'`. Pass an absolute `inputs.cwd` with `options.spawnCwd` set to
 * another directory to exercise absolute-path resolution.
 */
export function runAction(
  fixture: Fixture,
  inputs: ActionInputs = {},
  options: {spawnCwd?: string} = {},
): RunActionResult {
  assertLocalOrigin(
    git(['remote', 'get-url', 'origin'], fixture.local),
    fixture.remote,
  );

  if (!fs.existsSync(ACTION_ENTRY)) {
    throw new Error(
      `Missing ${ACTION_ENTRY}. Build the action (npm run build) before running integration tests.`,
    );
  }

  const outputFile = path.join(
    path.dirname(fixture.local),
    `github_output_${process.pid}_${Date.now()}`,
  );
  fs.writeFileSync(outputFile, '');

  const merged: Record<string, string> = {
    // Mirror action.yml defaults that matter when spawning lib/ directly.
    cwd: '.',
    add: '.',
    allow_unsafe_git_protocols: 'false',
    default_author: 'github_actor',
    dry_run: 'false',
    pathspec_error_handling: 'ignore',
    push: 'false',
    push_attempts: '1',
    fetch: 'false',
    author_name: 'Integration Tester',
    author_email: 'integration@example.com',
    message: 'Integration test commit',
    ...inputs,
  };

  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    TMPDIR: process.env.TMPDIR ?? os.tmpdir(),
    LANG: process.env.LANG,
    GITHUB_ACTOR: 'integration-tester',
    GITHUB_WORKFLOW: 'integration-test',
    GITHUB_OUTPUT: outputFile,
    // Avoid picking up a real event payload if present in the parent env.
    GITHUB_EVENT_PATH: '',
    GITHUB_EVENT_NAME: 'push',
    GITHUB_REF: `refs/heads/${fixture.defaultBranch}`,
  };

  for (const [key, value] of Object.entries(merged)) {
    if (value !== undefined) {
      env[`INPUT_${key.toUpperCase()}`] = value;
    }
  }

  const result = spawnSync(process.execPath, [ACTION_ENTRY], {
    cwd: options.spawnCwd ?? fixture.local,
    env,
    encoding: 'utf8',
    // Action can take a bit when doing push/tag; keep a generous limit.
    timeout: 60_000,
  });

  const outputs = parseGitHubOutput(outputFile);
  try {
    fs.unlinkSync(outputFile);
  } catch {
    // ignore
  }

  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    outputs,
  };
}

export function gitLog(repo: string, format: string, ref = 'HEAD'): string {
  return git(['log', '-1', `--format=${format}`, ref], repo);
}

export function gitRevParse(repo: string, ref: string): string {
  return git(['rev-parse', ref], repo);
}

export function remoteHasRef(remote: string, ref: string): boolean {
  try {
    git(['rev-parse', '--verify', ref], remote);
    return true;
  } catch {
    return false;
  }
}

export function listFilesAtHead(repo: string): string[] {
  const out = git(['ls-tree', '-r', '--name-only', 'HEAD'], repo);
  return out ? out.split('\n') : [];
}

export function writeFile(repo: string, relativePath: string, content: string) {
  const full = path.join(repo, relativePath);
  fs.mkdirSync(path.dirname(full), {recursive: true});
  fs.writeFileSync(full, content);
}

/**
 * Clone the bare remote into a sibling worktree, commit a file, and push.
 * Returns the new remote HEAD SHA. Does not touch `fixture.local`.
 */
export function commitAndPushToRemote(
  fixture: Fixture,
  relativePath: string,
  content: string,
  message: string,
): string {
  const parent = path.dirname(fixture.local);
  const work = fs.mkdtempSync(path.join(parent, 'remote-work-'));
  try {
    git(['clone', '-q', fixture.remote, '.'], work);
    configureFixtureRepo(work, 'Remote Writer', 'remote@example.com');
    writeFile(work, relativePath, content);
    git(['add', '--', relativePath], work);
    git(['commit', '-q', '-m', message], work);
    git(['push', '-q', 'origin', 'HEAD'], work);
    return git(['rev-parse', 'HEAD'], work);
  } finally {
    fs.rmSync(work, {recursive: true, force: true});
  }
}

export function removeFile(repo: string, relativePath: string) {
  fs.unlinkSync(path.join(repo, relativePath));
}

/** Create a nested git repo under `relativeDir` (used to provoke unexpected gitlinks). */
export function initNestedGitRepo(repo: string, relativeDir: string) {
  const full = path.join(repo, relativeDir);
  fs.mkdirSync(full, {recursive: true});
  fs.writeFileSync(path.join(full, 'nested.txt'), 'nested\n');
  git(['init'], full);
  configureFixtureRepo(full, 'Nested Repo', 'nested@example.com');
  git(['add', 'nested.txt'], full);
  git(['commit', '-q', '-m', 'Nested initial'], full);
}
