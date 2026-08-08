import {parseArgsStringToArgv} from 'string-argv';
import * as core from '@actions/core';
import * as YAML from 'js-yaml';
import {getOctokit} from '@actions/github';
import {execFileSync} from 'child_process';
import * as fs from 'fs';
import {getInput} from './io';

function getOctokitClient() {
  const token = getInput('github_token');
  if (!token) {
    throw new Error('github_token is required');
  }
  return getOctokit(token);
}

export async function getUserInfo(username?: string) {
  if (!username) return undefined;

  const octokit = getOctokitClient();
  const res = await octokit.rest.users.getByUsername({username});

  core.debug(
    `Fetched github actor from the API: ${JSON.stringify(res?.data, null, 2)}`,
  );

  return {
    name: res?.data?.name,
    email: res?.data?.email,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function log(err: any, data?: any) {
  if (data) console.log(data);
  if (err) core.error(err);
}

/**
 * Ensures `name` is safe to pass as a single git branch/ref positional argument.
 * Rejects empty values, leading hyphens (git option injection), whitespace/control
 * chars, and names rejected by `git check-ref-format --branch`.
 */
export function assertValidBranchName(name: string): void {
  if (!name || !name.trim()) {
    throw new Error('The new_branch value is empty.');
  }
  if (name.startsWith('-')) {
    throw new Error(
      `The new_branch value '${name}' cannot start with '-' (it would be interpreted as a git option).`,
    );
  }
  for (const char of name) {
    const code = char.codePointAt(0)!;
    if (
      code <= 0x1f || // C0 controls
      code === 0x7f || // DEL
      (code >= 0x80 && code <= 0x9f) || // C1 controls
      /\s/u.test(char) // Unicode whitespace (e.g. NBSP)
    ) {
      throw new Error(
        `The new_branch value '${name}' contains whitespace or control characters.`,
      );
    }
  }

  try {
    // Leading '-' is already rejected above so this cannot be parsed as a flag.
    execFileSync('git', ['check-ref-format', '--branch', name], {
      stdio: 'ignore',
    });
  } catch {
    throw new Error(
      `The new_branch value '${name}' is not a valid git branch name.`,
    );
  }
}

/**
 * Remote-helper overrides that make the local git client execute an arbitrary
 * program during fetch/pull/push. Git also accepts unique abbreviations of
 * these long options, so we reject every valid nonempty prefix of each name.
 *
 * `minPrefix` is the shortest unambiguous abbreviation Git currently accepts
 * for that option (shorter prefixes are ambiguous and rejected by Git itself).
 */
const DANGEROUS_REMOTE_HELPER_OPTIONS: ReadonlyArray<{
  canonical: string;
  minPrefix: string;
}> = [
  {canonical: 'upload-pack', minPrefix: 'upl'},
  {canonical: 'receive-pack', minPrefix: 'rece'},
  {canonical: 'exec', minPrefix: 'e'},
];

function getLongOptionName(arg: string): string | undefined {
  if (!arg.startsWith('--') || arg === '--') return undefined;
  const body = arg.slice(2);
  const eq = body.indexOf('=');
  return (eq === -1 ? body : body.slice(0, eq)).toLowerCase();
}

function isDangerousRemoteHelperOption(arg: string): boolean {
  const name = getLongOptionName(arg);
  if (!name) return false;
  return DANGEROUS_REMOTE_HELPER_OPTIONS.some(
    ({canonical, minPrefix}) =>
      name.length >= minPrefix.length && canonical.startsWith(name),
  );
}

/**
 * Matches the given string to an array of arguments.
 * The parsing is made by `string-argv`: if your way of using argument is not supported, the issue is theirs!
 * {@link https://www.npm.im/string-argv}
 * @example
 * ```js
 * matchGitArgs(`
    -s
    --longOption 'This uses the "other" quotes'
    --foo 1234
    --file=message.txt
    --file2="Application 'Support'/\"message\".txt"
  `) => [
    '-s',
    '--longOption',
    'This uses the "other" quotes',
    '--foo',
    '1234',
    '--file=message.txt',
    `--file2="Application 'Support'/\\"message\\".txt"`
  ]
 * matchGitArgs('      ') => [ ]
 * ```
 * @returns An array, if there's no match it'll be empty
 * @throws If the args include a blocked remote-helper override (`--upload-pack`, `--receive-pack`, `--exec`, or abbreviations)
 */
export function matchGitArgs(string: string) {
  const parsed = parseArgsStringToArgv(string);
  core.debug(`Git args parsed:
  - Original: ${string}
  - Parsed: ${JSON.stringify(parsed)}`);

  for (const arg of parsed) {
    if (isDangerousRemoteHelperOption(arg)) {
      throw new Error(
        `Git argument '${arg}' is not allowed: overriding the remote helper (--upload-pack, --receive-pack, --exec) can execute arbitrary commands on the runner.`,
      );
    }
  }

  return parsed;
}

/**
 * Parses `git diff --cached --raw` output and returns paths that would introduce
 * a new gitlink (mode 160000) — i.e. an embedded git repository staged as if it
 * were a submodule. Updates that stay 160000→160000 (existing submodule bumps)
 * are allowed.
 *
 * Raw line shape: `:oldmode newmode oldsha newsha status\tpath`
 */
export function findUnexpectedGitlinks(diffCachedRaw: string): string[] {
  const paths: string[] = [];
  for (const line of diffCachedRaw.split('\n')) {
    if (!line.startsWith(':')) continue;
    const match = line.match(
      /^:(\d{6}) (\d{6}) [0-9a-f]+ [0-9a-f]+ [A-Z]\t(.+)$/,
    );
    if (!match) continue;
    const [, oldMode, newMode, filePath] = match;
    if (newMode === '160000' && oldMode !== '160000') {
      paths.push(filePath);
    }
  }
  return paths;
}

/**
 * Fails the action if `git add` staged any unexpected gitlinks (embedded repos).
 */
export function assertNoUnexpectedGitlinks(paths: string[]): void {
  if (paths.length === 0) return;

  const listed = paths.map(p => `  - ${p}`).join('\n');
  const rmHints = paths.map(p => `  git rm --cached ${p}`).join('\n');
  throw new Error(
    `Refusing to commit unexpected gitlink(s) (embedded git repository staged as mode 160000):\n${listed}\n` +
      'Git records a nested .git directory as a gitlink, not as its files. ' +
      `Remove the nested .git directory, or unstage the path(s) with:\n${rmHints}`,
  );
}

/**
 * Tries to parse a YAML sequence (which can be a JSON array).
 * If it fails, it returns an array containing the input value as its only element.
 */
export function parseInputArray(input: string): string[] {
  core.debug(`Parsing input array: ${input}`);
  try {
    const yaml = YAML.load(input);
    if (yaml && Array.isArray(yaml) && yaml.every(e => typeof e === 'string')) {
      core.debug(`Input parsed as YAML array of length ${yaml.length}`);
      return yaml;
    }
  } catch {} // eslint-disable-line no-empty

  core.debug('Input parsed as single string');
  return [input];
}

export function readJSON(filePath: string) {
  let fileContent: string;
  try {
    fileContent = fs.readFileSync(filePath, {encoding: 'utf8'});
  } catch {
    throw `Couldn't read file. File path: ${filePath}`;
  }

  try {
    return JSON.parse(fileContent);
  } catch {
    throw `Couldn't parse file to JSON. File path: ${filePath}`;
  }
}
