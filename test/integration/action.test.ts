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

  it('creates a new branch and pushes it to the remote', () => {
    const f = fixture!;
    writeFile(f.local, 'branch.txt', 'branch me\n');

    const result = runAction(f, {
      message: 'Commit on new branch',
      new_branch: 'integration-new-branch',
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
  });

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

  it('pull: true incorporates remote commits before committing', () => {
    const f = fixture!;
    commitAndPushToRemote(f, 'from-remote.txt', 'remote\n', 'Remote change');
    writeFile(f.local, 'from-local.txt', 'local\n');

    const result = runAction(f, {
      message: 'Local change',
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

  it('dry_run with pull: true reports a default pull without mutating', () => {
    const f = fixture!;
    writeFile(f.local, 'dry-pull.txt', 'preview\n');
    const before = gitRevParse(f.local, 'HEAD');

    const result = runAction(f, {
      message: 'Would commit',
      dry_run: 'true',
      pull: 'true',
      push: 'false',
    });

    expect(result.status).toBe(0);
    expect(result.outputs.committed).toBe('false');
    expect(gitRevParse(f.local, 'HEAD')).toBe(before);
    expect(listFilesAtHead(f.local)).not.toContain('dry-pull.txt');
    expect(result.stdout).toMatch(/> Would pull from remote\./);
    expect(result.stdout).not.toMatch(/with: true/);
  });
});
