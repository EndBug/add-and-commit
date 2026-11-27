import {execFileSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  commitAndPushToRemote,
  createFixture,
  type Fixture,
  gitLog,
  gitRevParse,
  initNestedGitRepo,
  listFilesAtHead,
  remoteHasRef,
  removeFile,
  runAction,
  writeFile,
} from './helpers';

describe('action integration', () => {
  let fixture: Fixture | undefined;

  beforeEach(() => {
    fixture = createFixture();
  });

  afterEach(() => {
    fixture?.cleanup();
    fixture = undefined;
  });

  it('commits changes with push disabled and sets outputs', () => {
    const f = fixture!;
    writeFile(f.local, 'changed.txt', 'hello\n');

    const before = gitRevParse(f.local, 'HEAD');
    const result = runAction(f, {
      message: 'Add changed.txt',
      push: 'false',
    });

    expect(result.status).toBe(0);
    expect(result.outputs.committed).toBe('true');
    expect(result.outputs.pushed).toBe('false');
    expect(result.outputs.commit_long_sha).toMatch(/^[0-9a-f]{40}$/);
    expect(result.outputs.commit_sha).toBe(
      result.outputs.commit_long_sha!.slice(0, 7),
    );

    const after = gitRevParse(f.local, 'HEAD');
    expect(after).not.toBe(before);
    expect(after).toBe(result.outputs.commit_long_sha);
    expect(gitLog(f.local, '%s')).toBe('Add changed.txt');
    expect(gitLog(f.local, '%an <%ae>')).toBe(
      'Integration Tester <integration@example.com>',
    );
    expect(listFilesAtHead(f.local)).toContain('changed.txt');
    expect(remoteHasRef(f.remote, 'HEAD')).toBe(true);
    // Remote still on initial commit — nothing pushed.
    expect(gitRevParse(f.remote, 'HEAD')).toBe(before);
  });

  it('does nothing when the working tree is clean', () => {
    const f = fixture!;
    const before = gitRevParse(f.local, 'HEAD');
    const result = runAction(f, {push: 'false'});

    expect(result.status).toBe(0);
    expect(result.outputs.committed).toBe('false');
    expect(result.outputs.pushed).toBe('false');
    expect(result.outputs.commit_long_sha || undefined).toBeUndefined();
    expect(gitRevParse(f.local, 'HEAD')).toBe(before);
  });

  it('dry_run reports without committing or changing the tree', () => {
    const f = fixture!;
    writeFile(f.local, 'dry-run.txt', 'preview\n');
    const before = gitRevParse(f.local, 'HEAD');

    const result = runAction(f, {
      message: 'Would commit',
      dry_run: 'true',
      push: 'true',
    });

    expect(result.status).toBe(0);
    expect(result.outputs.committed).toBe('false');
    expect(result.outputs.pushed).toBe('false');
    expect(result.outputs.commit_long_sha || undefined).toBeUndefined();
    expect(gitRevParse(f.local, 'HEAD')).toBe(before);
    expect(listFilesAtHead(f.local)).not.toContain('dry-run.txt');
    expect(fs.existsSync(path.join(f.local, 'dry-run.txt'))).toBe(true);
    expect(result.stdout).toMatch(/Dry run completed/i);
  });

  it('dry_run on a clean tree does not claim a commit', () => {
    const f = fixture!;
    const before = gitRevParse(f.local, 'HEAD');

    const result = runAction(f, {
      dry_run: 'true',
      push: 'true',
    });

    expect(result.status).toBe(0);
    expect(result.outputs.committed).toBe('false');
    expect(result.outputs.pushed).toBe('false');
    expect(gitRevParse(f.local, 'HEAD')).toBe(before);
    expect(result.stdout).toMatch(/nothing would be committed/i);
  });

  it('dry_run still refuses unexpected gitlinks without mutating HEAD', () => {
    const f = fixture!;
    initNestedGitRepo(f.local, 'embedded');
    const before = gitRevParse(f.local, 'HEAD');

    const result = runAction(f, {
      message: 'Would embed repo',
      dry_run: 'true',
      push: 'false',
    });

    expect(result.status).not.toBe(0);
    expect(result.outputs.committed).toBe('false');
    expect(gitRevParse(f.local, 'HEAD')).toBe(before);
    expect(`${result.stdout}\n${result.stderr}`).toMatch(/gitlink/i);
  });

  it('rejects remote-helper overrides after -u in fetch args', () => {
    const f = fixture!;
    writeFile(f.local, 'fetch-args.txt', 'changed\n');
    const before = gitRevParse(f.local, 'HEAD');

    const result = runAction(f, {
      message: 'Should not fetch with blocked args',
      fetch: '-u --upl=evil',
      push: 'false',
    });

    expect(result.status).not.toBe(0);
    expect(result.outputs.committed).toBe('false');
    expect(gitRevParse(f.local, 'HEAD')).toBe(before);
    expect(`${result.stdout}\n${result.stderr}`).toMatch(/not allowed/);
  });

  it('rejects glued quotes that would inject --force into push', () => {
    const f = fixture!;
    writeFile(f.local, 'glued-quotes.txt', 'changed\n');
    const beforeRemote = gitRevParse(f.remote, 'HEAD');

    const result = runAction(f, {
      message: 'Should not push with glued quotes',
      fetch: 'false',
      push: "origin 'main'--force --set-upstream",
    });

    expect(result.status).not.toBe(0);
    expect(result.outputs.pushed).toBe('false');
    expect(gitRevParse(f.remote, 'HEAD')).toBe(beforeRemote);
    expect(`${result.stdout}\n${result.stderr}`).toMatch(
      /quoted segment immediately followed by non-whitespace/,
    );
  });

  it('applies custom author and committer', () => {
    const f = fixture!;
    writeFile(f.local, 'id.txt', 'id\n');

    const result = runAction(f, {
      message: 'Custom identity',
      author_name: 'Author Name',
      author_email: 'author@example.com',
      committer_name: 'Committer Name',
      committer_email: 'committer@example.com',
      push: 'false',
    });

    expect(result.status).toBe(0);
    expect(result.outputs.committed).toBe('true');
    expect(gitLog(f.local, '%an <%ae>')).toBe(
      'Author Name <author@example.com>',
    );
    expect(gitLog(f.local, '%cn <%ce>')).toBe(
      'Committer Name <committer@example.com>',
    );
  });

  it('creates a local tag', () => {
    const f = fixture!;
    writeFile(f.local, 'tagged.txt', 'tag me\n');

    const result = runAction(f, {
      message: 'Tagged commit',
      tag: 'v0.0.0-test',
      push: 'false',
    });

    expect(result.status).toBe(0);
    expect(result.outputs.committed).toBe('true');
    expect(result.outputs.tagged).toBe('true');
    expect(result.outputs.tag_pushed).toBe('false');

    const tagSha = gitRevParse(f.local, 'refs/tags/v0.0.0-test');
    expect(tagSha).toBe(result.outputs.commit_long_sha);
  });

  it('pushes the commit to the local bare remote', () => {
    const f = fixture!;
    writeFile(f.local, 'pushed.txt', 'push me\n');
    const beforeRemote = gitRevParse(f.remote, 'HEAD');

    const result = runAction(f, {
      message: 'Push to bare remote',
      push: 'true',
      fetch: 'false',
    });

    expect(result.status).toBe(0);
    expect(result.outputs.committed).toBe('true');
    expect(result.outputs.pushed).toBe('true');

    const localHead = gitRevParse(f.local, 'HEAD');
    const remoteHead = gitRevParse(f.remote, 'HEAD');
    expect(remoteHead).toBe(localHead);
    expect(remoteHead).not.toBe(beforeRemote);
    expect(remoteHead).toBe(result.outputs.commit_long_sha);
  });

  it.each(['false', 'true', '--rebase --autostash'])(
    'creates a new branch and pushes it with pull: %s',
    pull => {
      const f = fixture!;
      writeFile(f.local, 'branch.txt', 'branch me\n');

      const result = runAction(f, {
        message: 'Commit on new branch',
        new_branch: 'integration-new-branch',
        pull,
        push: 'true',
        fetch: 'false',
      });

      expect(result.status).toBe(0);
      expect(result.outputs.committed).toBe('true');
      expect(result.outputs.pushed).toBe('true');

      expect(remoteHasRef(f.remote, 'refs/heads/integration-new-branch')).toBe(
        true,
      );
      const remoteBranchSha = gitRevParse(
        f.remote,
        'refs/heads/integration-new-branch',
      );
      expect(remoteBranchSha).toBe(result.outputs.commit_long_sha);
      expect(listFilesAtHead(f.local)).toContain('branch.txt');
    },
  );

  describe('new branch push retries', () => {
    function rejectFirstPush(f: Fixture, firstPushCommands: string[] = []) {
      fs.writeFileSync(
        path.join(f.remote, 'hooks', 'pre-receive'),
        [
          '#!/bin/sh',
          'set -eu',
          'while read old new ref; do',
          '  printf "%s %s\\n" "$new" "${GIT_PUSH_OPTION_0-}" >> hooks/push-attempts',
          'done',
          'if [ ! -f hooks/rejected-first-push ]; then',
          '  : > hooks/rejected-first-push',
          ...firstPushCommands,
          '  echo "Rejecting first push for retry regression" >&2',
          '  exit 1',
          'fi',
          '',
        ].join('\n'),
        {mode: 0o755},
      );
      return path.join(f.remote, 'hooks', 'push-attempts');
    }

    it.each(['true', '--rebase --autostash'])(
      'retries a rejected first push without an upstream with pull: %s',
      pull => {
        const f = fixture!;
        const branch = 'integration-retry-branch';
        const attemptsPath = rejectFirstPush(f);
        writeFile(f.local, 'retry.txt', 'retry me\n');

        const result = runAction(f, {
          message: 'Commit on retry branch',
          new_branch: branch,
          fetch: 'false',
          pull,
          push: 'true',
          push_attempts: '2',
        });

        expect(result.status).toBe(0);
        expect(result.outputs.committed).toBe('true');
        expect(result.outputs.pushed).toBe('true');
        const attemptedCommits = fs
          .readFileSync(attemptsPath, 'utf8')
          .trim()
          .split('\n')
          .map(line => line.split(' ')[0]);
        expect(attemptedCommits).toEqual([
          result.outputs.commit_long_sha,
          result.outputs.commit_long_sha,
        ]);
        expect(gitRevParse(f.remote, `refs/heads/${branch}`)).toBe(
          result.outputs.commit_long_sha,
        );
        expect(listFilesAtHead(f.local)).toContain('retry.txt');
      },
    );

    it.each(['true', '--rebase --autostash'])(
      'integrates a concurrently created remote branch before retrying the default push with pull: %s',
      pull => {
        const f = fixture!;
        const branch = 'integration-concurrent-branch';
        const remoteHead = commitAndPushToRemote(
          f,
          'from-remote.txt',
          'remote\n',
          'Concurrent remote change',
        );
        const attemptsPath = rejectFirstPush(f, [
          // The competing commit is already in the bare repo. Ref updates cannot
          // run inside receive-pack's incoming-object quarantine.
          '  unset GIT_QUARANTINE_PATH GIT_OBJECT_DIRECTORY GIT_ALTERNATE_OBJECT_DIRECTORIES',
          `  git update-ref refs/heads/${branch} ${remoteHead}`,
        ]);
        writeFile(f.local, 'from-local.txt', 'local\n');

        const result = runAction(f, {
          message: 'Local change on concurrent branch',
          new_branch: branch,
          fetch: 'false',
          pull,
          push: 'true',
          push_attempts: '2',
        });

        expect(result.status).toBe(0);
        expect(result.outputs.committed).toBe('true');
        expect(result.outputs.pushed).toBe('true');
        const attempts = fs
          .readFileSync(attemptsPath, 'utf8')
          .trim()
          .split('\n')
          .map(line => line.split(' '));
        expect(attempts).toHaveLength(2);
        expect(attempts[0][0]).not.toBe(attempts[1][0]);
        expect(attempts[1][0]).toBe(result.outputs.commit_long_sha);
        expect(gitRevParse(f.remote, `refs/heads/${branch}`)).toBe(
          result.outputs.commit_long_sha,
        );
        execFileSync('git', [
          '--git-dir',
          path.join(f.local, '.git'),
          'merge-base',
          '--is-ancestor',
          remoteHead,
          'HEAD',
        ]);
        const files = listFilesAtHead(f.local);
        expect(files).toContain('from-remote.txt');
        expect(files).toContain('from-local.txt');
      },
    );

    it('preserves explicit alternate pull and push destinations across a retry', () => {
      const f = fixture!;
      const localBranch = 'integration-local-branch';
      const remoteBranch = 'alternate-target';
      const initial = gitRevParse(f.remote, 'HEAD');
      const remoteHead = commitAndPushToRemote(
        f,
        'from-remote.txt',
        'remote\n',
        'Concurrent alternate remote change',
      );
      execFileSync('git', [
        '--git-dir',
        f.remote,
        'branch',
        remoteBranch,
        initial,
      ]);
      execFileSync('git', [
        '--git-dir',
        path.join(f.local, '.git'),
        'remote',
        'add',
        'upstream',
        f.remote,
      ]);
      execFileSync('git', [
        '--git-dir',
        f.remote,
        'config',
        'receive.advertisePushOptions',
        'true',
      ]);
      const attemptsPath = rejectFirstPush(f, [
        '  unset GIT_QUARANTINE_PATH GIT_OBJECT_DIRECTORY GIT_ALTERNATE_OBJECT_DIRECTORIES',
        `  git update-ref refs/heads/${remoteBranch} ${remoteHead}`,
      ]);
      writeFile(f.local, 'from-local.txt', 'local\n');

      const result = runAction(f, {
        message: 'Local change for alternate target',
        new_branch: localBranch,
        fetch: 'false',
        pull: `--rebase --autostash upstream ${remoteBranch}`,
        push: `--push-option=retry-marker --set-upstream upstream HEAD:refs/heads/${remoteBranch}`,
        push_attempts: '2',
      });

      expect(result.status).toBe(0);
      expect(result.outputs.committed).toBe('true');
      expect(result.outputs.pushed).toBe('true');
      const attempts = fs
        .readFileSync(attemptsPath, 'utf8')
        .trim()
        .split('\n')
        .map(line => line.split(' '));
      expect(attempts).toHaveLength(2);
      expect(attempts.map(([, option]) => option)).toEqual([
        'retry-marker',
        'retry-marker',
      ]);
      expect(attempts[0][0]).not.toBe(attempts[1][0]);
      expect(attempts[1][0]).toBe(result.outputs.commit_long_sha);
      expect(gitRevParse(f.remote, `refs/heads/${remoteBranch}`)).toBe(
        result.outputs.commit_long_sha,
      );
      expect(remoteHasRef(f.remote, `refs/heads/${localBranch}`)).toBe(false);
      expect(gitLog(f.local, '%P')).toBe(remoteHead);
      const files = listFilesAtHead(f.local);
      expect(files).toContain('from-remote.txt');
      expect(files).toContain('from-local.txt');
    });
  });

  it('validates blocked pull arguments even when new_branch has no upstream', () => {
    const f = fixture!;
    const before = gitRevParse(f.local, 'HEAD');
    writeFile(f.local, 'blocked-pull.txt', 'changed\n');

    const result = runAction(f, {
      new_branch: 'blocked-pull-branch',
      fetch: 'false',
      pull: '--upload-pack=blocked-helper',
      push: 'false',
    });

    expect(result.status).not.toBe(0);
    expect(result.outputs.committed).toBe('false');
    expect(gitRevParse(f.local, 'HEAD')).toBe(before);
    expect(`${result.stdout}\n${result.stderr}`).toMatch(/not allowed/);
  });

  it.each([
    {narrowFetch: false, label: 'standard fetch mapping'},
    {narrowFetch: true, label: 'fetch mapping that omits the merge branch'},
  ])(
    'pulls when a newly created branch inherits an upstream with $label',
    ({narrowFetch}) => {
      const f = fixture!;
      const remoteHead = commitAndPushToRemote(
        f,
        'from-remote.txt',
        'remote\n',
        'Remote change',
      );
      execFileSync('git', [
        '--git-dir',
        path.join(f.local, '.git'),
        'config',
        'branch.autoSetupMerge',
        'inherit',
      ]);
      if (narrowFetch) {
        execFileSync('git', [
          '--git-dir',
          f.remote,
          'branch',
          'fetch-only',
          gitRevParse(f.local, 'HEAD'),
        ]);
        execFileSync('git', [
          '--git-dir',
          path.join(f.local, '.git'),
          'config',
          'remote.origin.fetch',
          '+refs/heads/fetch-only:refs/remotes/origin/fetch-only',
        ]);
      }
      writeFile(f.local, 'from-local.txt', 'local\n');

      const result = runAction(f, {
        new_branch: 'inherited-upstream-branch',
        fetch: 'false',
        pull: '--rebase --autostash',
        push: 'false',
      });

      expect(result.status).toBe(0);
      expect(result.outputs.committed).toBe('true');
      if (!narrowFetch) {
        expect(gitRevParse(f.local, '@{upstream}')).toBe(remoteHead);
      }
      expect(gitLog(f.local, '%P')).toBe(remoteHead);
      const files = listFilesAtHead(f.local);
      expect(files).toContain('from-remote.txt');
      expect(files).toContain('from-local.txt');
    },
  );

  it('removes files with the remove input', () => {
    const f = fixture!;
    // Seed already has README.md; ensure it exists then remove via the action.
    expect(listFilesAtHead(f.local)).toContain('README.md');
    // Make a dirty tree so add+remove both run: touch another file and remove README.
    writeFile(f.local, 'keep.txt', 'keep\n');
    removeFile(f.local, 'README.md');

    const result = runAction(f, {
      message: 'Remove README',
      add: 'keep.txt',
      remove: 'README.md',
      push: 'false',
    });

    expect(result.status).toBe(0);
    expect(result.outputs.committed).toBe('true');

    const files = listFilesAtHead(f.local);
    expect(files).not.toContain('README.md');
    expect(files).toContain('keep.txt');
  });

  it('only commits files matched by selective add', () => {
    const f = fixture!;
    writeFile(f.local, 'include-me.txt', 'yes\n');
    writeFile(f.local, 'skip-me.txt', 'no\n');

    const result = runAction(f, {
      message: 'Selective add',
      add: 'include-me.txt',
      push: 'false',
    });

    expect(result.status).toBe(0);
    expect(result.outputs.committed).toBe('true');

    const files = listFilesAtHead(f.local);
    expect(files).toContain('include-me.txt');
    expect(files).not.toContain('skip-me.txt');
    // Untracked file should still be on disk.
    expect(fs.existsSync(path.join(f.local, 'skip-me.txt'))).toBe(true);
  });

  it.each([
    {selectBranch: false, label: 'on the current branch'},
    {selectBranch: true, label: 'on an existing local new_branch'},
  ])('pull: true incorporates remote commits $label', ({selectBranch}) => {
    const f = fixture!;
    commitAndPushToRemote(f, 'from-remote.txt', 'remote\n', 'Remote change');
    writeFile(f.local, 'from-local.txt', 'local\n');

    const result = runAction(f, {
      message: 'Local change',
      ...(selectBranch ? {new_branch: f.defaultBranch} : {}),
      pull: 'true',
      push: 'false',
    });

    expect(result.status).toBe(0);
    expect(result.outputs.committed).toBe('true');
    expect(result.stdout).toMatch(/> Pulling from remote/);
    expect(result.stdout).not.toMatch(/Not pulling from repo/);

    const files = listFilesAtHead(f.local);
    expect(files).toContain('from-remote.txt');
    expect(files).toContain('from-local.txt');
  });

  it.each([
    {fetch: 'true', label: 'a fetched remote branch'},
    {fetch: 'false', label: 'an explicit unfetched remote branch'},
  ])('pulls from $label before pushing a new_branch', ({fetch}) => {
    const f = fixture!;
    const branch = 'integration-remote-branch';
    const remoteHead = commitAndPushToRemote(
      f,
      'from-remote.txt',
      'remote\n',
      'Remote change',
    );
    execFileSync('git', ['--git-dir', f.remote, 'branch', branch, remoteHead]);
    expect(remoteHasRef(f.local, `refs/heads/${branch}`)).toBe(false);
    expect(remoteHasRef(f.local, `refs/remotes/origin/${branch}`)).toBe(false);
    writeFile(f.local, 'from-local.txt', 'local\n');

    const result = runAction(f, {
      message: 'Local change on remote branch',
      new_branch: branch,
      fetch,
      pull: fetch === 'true' ? 'true' : `--rebase --autostash origin ${branch}`,
      push: 'true',
    });

    expect(result.status).toBe(0);
    expect(result.outputs.committed).toBe('true');
    expect(result.outputs.pushed).toBe('true');
    expect(result.stdout).toMatch(/> Pulling from remote/);
    expect(gitLog(f.local, '%P')).toBe(remoteHead);
    expect(gitRevParse(f.remote, `refs/heads/${branch}`)).toBe(
      result.outputs.commit_long_sha,
    );
    expect(gitRevParse(f.local, `refs/heads/${branch}`)).toBe(
      result.outputs.commit_long_sha,
    );
    const files = listFilesAtHead(f.local);
    expect(files).toContain('from-remote.txt');
    expect(files).toContain('from-local.txt');
  });

  it.each([
    {pull: 'false', label: 'false'},
    {pull: undefined, label: 'omitted'},
  ])('skips pull when pull is $label', ({pull}) => {
    const f = fixture!;
    commitAndPushToRemote(f, 'from-remote.txt', 'remote\n', 'Remote change');
    writeFile(f.local, 'from-local.txt', 'local\n');

    const result = runAction(f, {
      message: 'Local change only',
      ...(pull !== undefined ? {pull} : {}),
      push: 'false',
    });

    expect(result.status).toBe(0);
    expect(result.outputs.committed).toBe('true');
    expect(result.stdout).toMatch(/Not pulling from repo/);

    const files = listFilesAtHead(f.local);
    expect(files).toContain('from-local.txt');
    expect(files).not.toContain('from-remote.txt');
  });

  it('pull with custom git args still pulls', () => {
    const f = fixture!;
    commitAndPushToRemote(f, 'from-remote.txt', 'remote\n', 'Remote change');
    writeFile(f.local, 'from-local.txt', 'local\n');

    const result = runAction(f, {
      message: 'Local change',
      pull: '--rebase --autostash',
      push: 'false',
    });

    expect(result.status).toBe(0);
    expect(result.outputs.committed).toBe('true');
    expect(result.stdout).toMatch(/> Pulling from remote/);

    const files = listFilesAtHead(f.local);
    expect(files).toContain('from-remote.txt');
    expect(files).toContain('from-local.txt');
  });

  it.each([
    {newBranch: undefined, label: 'the current branch'},
    {newBranch: 'dry-run-branch', label: 'a new_branch'},
  ])(
    'dry_run reports pull behavior for $label without mutating',
    ({newBranch}) => {
      const f = fixture!;
      writeFile(f.local, 'dry-pull.txt', 'preview\n');
      const before = gitRevParse(f.local, 'HEAD');
      const beforeRemote = gitRevParse(f.remote, 'HEAD');
      const indexPath = path.join(f.local, '.git', 'index');
      const beforeIndex = fs.readFileSync(indexPath);

      const result = runAction(f, {
        message: 'Would commit',
        dry_run: 'true',
        pull: 'true',
        push: 'true',
        ...(newBranch ? {new_branch: newBranch} : {}),
      });

      expect(result.status).toBe(0);
      expect(result.outputs.committed).toBe('false');
      expect(result.outputs.pushed).toBe('false');
      expect(gitRevParse(f.local, 'HEAD')).toBe(before);
      expect(gitRevParse(f.remote, 'HEAD')).toBe(beforeRemote);
      expect(fs.readFileSync(indexPath)).toEqual(beforeIndex);
      expect(listFilesAtHead(f.local)).not.toContain('dry-pull.txt');
      expect(fs.readFileSync(path.join(f.local, 'dry-pull.txt'), 'utf8')).toBe(
        'preview\n',
      );
      if (newBranch) {
        expect(result.stdout).toContain(
          '> Would pull from remote unless a new branch is created',
        );
        expect(remoteHasRef(f.local, `refs/heads/${newBranch}`)).toBe(false);
        expect(remoteHasRef(f.remote, `refs/heads/${newBranch}`)).toBe(false);
      } else {
        expect(result.stdout).toMatch(/> Would pull from remote\./);
      }
      expect(result.stdout).not.toMatch(/with: true/);
    },
  );

  it('commits when cwd is an absolute path and process.cwd differs', () => {
    const f = fixture!;
    writeFile(f.local, 'abs-cwd.txt', 'absolute\n');
    const before = gitRevParse(f.local, 'HEAD');
    // Spawn from the fixture parent so process.cwd() !== the git work tree.
    const spawnCwd = path.dirname(f.local);

    const result = runAction(
      f,
      {
        message: 'Absolute cwd commit',
        cwd: f.local,
        push: 'false',
      },
      {spawnCwd},
    );

    expect(result.status).toBe(0);
    expect(result.outputs.committed).toBe('true');
    expect(result.stdout).toMatch(
      new RegExp(`Running in ${f.local.replace(/\\/g, '\\\\')}`),
    );
    const after = gitRevParse(f.local, 'HEAD');
    expect(after).not.toBe(before);
    expect(after).toBe(result.outputs.commit_long_sha);
    expect(listFilesAtHead(f.local)).toContain('abs-cwd.txt');
  });

  it('neutralizes workflow-command payloads in logs without rewriting the commit', () => {
    const f = fixture!;
    writeFile(f.local, 'payload.txt', 'x\n');
    const payload = 'Normal title\n::stop-commands::7a3f9c1e';

    const result = runAction(f, {
      message: payload,
      push: 'false',
    });

    expect(result.status).toBe(0);
    expect(result.outputs.committed).toBe('true');
    expect(result.stdout).toContain(
      'Normal title\\u000a::stop-commands::7a3f9c1e',
    );
    expect(result.stdout.split(/\r?\n/)).not.toContain(
      '::stop-commands::7a3f9c1e',
    );
    expect(result.stdout).not.toMatch(/^::stop-commands::/m);
    // The commit keeps the raw newline; only the log is neutralized.
    // %s joins a multi-line subject with spaces; %B is the raw message.
    expect(gitLog(f.local, '%B')).toBe(payload);
    expect(gitLog(f.local, '%B')).not.toContain('\\u000a');
  });

  it('fails clearly when cwd does not exist without dumping the bundle', () => {
    const f = fixture!;
    const missing = path.join(
      path.dirname(f.local),
      `missing-cwd-${process.pid}-${Date.now()}`,
    );

    const result = runAction(
      f,
      {
        cwd: missing,
        push: 'false',
      },
      {spawnCwd: path.dirname(f.local)},
    );

    expect(result.status).not.toBe(0);
    const combined = `${result.stdout}\n${result.stderr}`;
    expect(combined).toMatch(/not an existing directory/);
    expect(combined).toContain(missing);
    // Uncaught throws from the minified bundle dump the whole line of source.
    expect(combined).not.toMatch(/function isObject/);
    expect(combined.length).toBeLessThan(50_000);
  });

  describe('rejects --pathspec-from-file / --pathspec-file-nul', () => {
    const MARKER_A = 'AAC_POC_SECRET_7f9c2e';
    const MARKER_B = 'AAC_SECOND_LINE_91a4d8';

    function writeDummyOutsideClone(f: Fixture): string {
      const dummyPath = path.join(
        path.dirname(f.local),
        `pathspec-dummy-${process.pid}.txt`,
      );
      fs.writeFileSync(dummyPath, `${MARKER_A}\n${MARKER_B}\n`);
      return dummyPath;
    }

    function pathspecFromFileArgs(dummyPath: string): string {
      return `--pathspec-from-file=${dummyPath} --pathspec-file-nul`;
    }

    function expectBlockedWithoutDisclosure(
      result: ReturnType<typeof runAction>,
    ) {
      const combined = `${result.stdout}\n${result.stderr}`;
      expect(result.status).not.toBe(0);
      expect(result.outputs.committed).toBe('false');
      expect(combined).toMatch(/not allowed/);
      expect(combined).not.toContain(MARKER_A);
      expect(combined).not.toContain(MARKER_B);
    }

    it('rejects add with pathspec_error_handling exitImmediately', () => {
      const f = fixture!;
      const dummyPath = writeDummyOutsideClone(f);
      const before = gitRevParse(f.local, 'HEAD');

      const result = runAction(f, {
        add: pathspecFromFileArgs(dummyPath),
        pathspec_error_handling: 'exitImmediately',
        push: 'false',
      });

      expectBlockedWithoutDisclosure(result);
      expect(gitRevParse(f.local, 'HEAD')).toBe(before);
    });

    it('rejects add with default pathspec_error_handling ignore', () => {
      const f = fixture!;
      const dummyPath = writeDummyOutsideClone(f);
      const before = gitRevParse(f.local, 'HEAD');

      const result = runAction(f, {
        add: pathspecFromFileArgs(dummyPath),
        push: 'false',
      });

      expectBlockedWithoutDisclosure(result);
      expect(gitRevParse(f.local, 'HEAD')).toBe(before);
    });

    it('rejects add during dry_run at parse, not git add --dry-run', () => {
      const f = fixture!;
      const dummyPath = writeDummyOutsideClone(f);
      const before = gitRevParse(f.local, 'HEAD');

      const result = runAction(f, {
        add: pathspecFromFileArgs(dummyPath),
        dry_run: 'true',
        push: 'false',
      });

      expectBlockedWithoutDisclosure(result);
      expect(gitRevParse(f.local, 'HEAD')).toBe(before);
      const combined = `${result.stdout}\n${result.stderr}`;
      expect(combined).not.toMatch(/fatal: pathspec/);
      expect(combined).not.toMatch(/Dry run completed/i);
    });

    it('rejects remove with the same options', () => {
      const f = fixture!;
      const dummyPath = writeDummyOutsideClone(f);
      const before = gitRevParse(f.local, 'HEAD');

      const result = runAction(f, {
        add: '',
        remove: pathspecFromFileArgs(dummyPath),
        push: 'false',
      });

      expectBlockedWithoutDisclosure(result);
      expect(gitRevParse(f.local, 'HEAD')).toBe(before);
    });

    it('rejects commit with the same options', () => {
      const f = fixture!;
      const dummyPath = writeDummyOutsideClone(f);
      writeFile(f.local, 'commit-args.txt', 'changed\n');
      const before = gitRevParse(f.local, 'HEAD');

      const result = runAction(f, {
        commit: pathspecFromFileArgs(dummyPath),
        push: 'false',
      });

      expectBlockedWithoutDisclosure(result);
      expect(gitRevParse(f.local, 'HEAD')).toBe(before);
    });

    it('rejects commit when a short-option cluster precedes the same options', () => {
      const f = fixture!;
      const dummyPath = writeDummyOutsideClone(f);
      writeFile(f.local, 'commit-cluster-args.txt', 'changed\n');
      const before = gitRevParse(f.local, 'HEAD');

      const result = runAction(f, {
        commit: `-Sm --pathspec-from-file=${dummyPath} -Sm --pathspec-file-nul`,
        push: 'false',
      });

      expectBlockedWithoutDisclosure(result);
      expect(gitRevParse(f.local, 'HEAD')).toBe(before);
    });

    it('rejects a YAML array element with the same options', () => {
      const f = fixture!;
      const dummyPath = writeDummyOutsideClone(f);
      const before = gitRevParse(f.local, 'HEAD');

      const result = runAction(f, {
        add: JSON.stringify([pathspecFromFileArgs(dummyPath)]),
        push: 'false',
      });

      expectBlockedWithoutDisclosure(result);
      expect(gitRevParse(f.local, 'HEAD')).toBe(before);
    });
  });
});
