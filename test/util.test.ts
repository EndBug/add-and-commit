import {
  assertNoUnexpectedGitlinks,
  assertValidBranchName,
  assertWorkingDirectory,
  findUnexpectedGitlinks,
  matchGitArgs,
  neutralizeForLog,
  neutralizeLogString,
  parseInputArray,
  pickGitIdentityConfig,
  resolveBaseDir,
} from '../src/util';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

describe('resolveBaseDir', () => {
  const from = path.join(path.sep, 'home', 'runner', 'work', 'repo', 'repo');

  it('resolves relative paths against from', () => {
    expect(resolveBaseDir('./my-checkout', from)).toBe(
      path.join(from, 'my-checkout'),
    );
    expect(resolveBaseDir('subdir', from)).toBe(path.join(from, 'subdir'));
  });

  it('keeps absolute paths', () => {
    const abs = path.join(from, 'my-checkout-path');
    expect(resolveBaseDir(abs, from)).toBe(abs);
    expect(resolveBaseDir(abs, path.join(from, 'other'))).toBe(abs);
  });

  it('treats empty and "." as from', () => {
    expect(resolveBaseDir('', from)).toBe(from);
    expect(resolveBaseDir('.', from)).toBe(from);
  });
});

describe('assertWorkingDirectory', () => {
  it('accepts an existing directory', () => {
    expect(() =>
      assertWorkingDirectory(os.tmpdir(), os.tmpdir()),
    ).not.toThrow();
  });

  it('rejects a missing path', () => {
    const missing = path.join(
      os.tmpdir(),
      `aac-missing-${process.pid}-${Date.now()}`,
    );
    expect(() => assertWorkingDirectory(missing, missing)).toThrow(
      /not an existing directory/,
    );
  });

  it('rejects a file path', () => {
    const file = path.join(
      os.tmpdir(),
      `aac-file-${process.pid}-${Date.now()}.txt`,
    );
    fs.writeFileSync(file, 'x');
    try {
      expect(() => assertWorkingDirectory(file, file)).toThrow(
        /not an existing directory/,
      );
    } finally {
      fs.unlinkSync(file);
    }
  });
});

describe('parseInputArray', () => {
  beforeAll(() => {
    process.env.GITHUB_EVENT_PATH = 'a';
    process.env.GITHUB_EVENT_NAME = 'b';
    process.env.GITHUB_REF = 'c';
    process.env.GITHUB_ACTOR = 'd';
  });

  afterAll(() => {
    delete process.env.GITHUB_EVENT_PATH;
    delete process.env.GITHUB_EVENT_NAME;
    delete process.env.GITHUB_REF;
    delete process.env.GITHUB_ACTOR;
  });

  it('parses string arrays', () => {
    expect(parseInputArray('["a", "bcd"]')).toStrictEqual(['a', 'bcd']);
  });

  it('passes strings through', () => {
    expect(parseInputArray('"hello"')).toStrictEqual(['"hello"']);
  });

  it('passes non-string elements through', () => {
    expect(parseInputArray('[42]')).toStrictEqual(['[42]']);
  });

  it('ignores failures', () => {
    expect(parseInputArray('"')).toStrictEqual(['"']);
  });
});

describe('assertValidBranchName', () => {
  beforeAll(() => {
    process.env.GITHUB_EVENT_PATH = 'a';
    process.env.GITHUB_EVENT_NAME = 'b';
    process.env.GITHUB_REF = 'c';
    process.env.GITHUB_ACTOR = 'd';
  });

  afterAll(() => {
    delete process.env.GITHUB_EVENT_PATH;
    delete process.env.GITHUB_EVENT_NAME;
    delete process.env.GITHUB_REF;
    delete process.env.GITHUB_ACTOR;
  });

  it('accepts typical branch names', () => {
    expect(() => assertValidBranchName('feature/foo')).not.toThrow();
    expect(() =>
      assertValidBranchName('dependabot/npm-and-yarn/pkg-1.2.3'),
    ).not.toThrow();
    expect(() => assertValidBranchName('fix/issue-123')).not.toThrow();
  });

  it('rejects empty or whitespace-only names', () => {
    expect(() => assertValidBranchName('')).toThrow(/empty/);
    expect(() => assertValidBranchName('   ')).toThrow(/empty/);
  });

  it('rejects names that start with a hyphen', () => {
    expect(() => assertValidBranchName('--force')).toThrow(/cannot start with/);
    expect(() => assertValidBranchName('-f')).toThrow(/cannot start with/);
    expect(() => assertValidBranchName('--delete')).toThrow(
      /cannot start with/,
    );
    expect(() => assertValidBranchName('-branch')).toThrow(/cannot start with/);
  });

  it('rejects names with whitespace or control characters', () => {
    expect(() => assertValidBranchName('has space')).toThrow(
      /whitespace or control/,
    );
    expect(() => assertValidBranchName('has\ttab')).toThrow(
      /whitespace or control/,
    );
    expect(() => assertValidBranchName('has\nnewline')).toThrow(
      /whitespace or control/,
    );
    expect(() => assertValidBranchName('has\u00A0nbsp')).toThrow(
      /whitespace or control/,
    );
    expect(() => assertValidBranchName('has\u0085nel')).toThrow(
      /whitespace or control/,
    );
  });

  it('rejects names that fail git check-ref-format --branch', () => {
    expect(() => assertValidBranchName('feature..name')).toThrow(
      /not a valid git branch name/,
    );
    expect(() => assertValidBranchName('name@{x}')).toThrow(
      /not a valid git branch name/,
    );
    expect(() => assertValidBranchName('name~1')).toThrow(
      /not a valid git branch name/,
    );
    expect(() => assertValidBranchName('name.')).toThrow(
      /not a valid git branch name/,
    );
  });
});

describe('matchGitArgs', () => {
  beforeAll(() => {
    process.env.GITHUB_EVENT_PATH = 'a';
    process.env.GITHUB_EVENT_NAME = 'b';
    process.env.GITHUB_REF = 'c';
    process.env.GITHUB_ACTOR = 'd';
  });

  afterAll(() => {
    delete process.env.GITHUB_EVENT_PATH;
    delete process.env.GITHUB_EVENT_NAME;
    delete process.env.GITHUB_REF;
    delete process.env.GITHUB_ACTOR;
  });

  it('parses safe documented argument strings', () => {
    expect(matchGitArgs('--tags --force')).toStrictEqual(['--tags', '--force']);
    expect(matchGitArgs('--rebase --autostash')).toStrictEqual([
      '--rebase',
      '--autostash',
    ]);
    expect(matchGitArgs('origin main --force')).toStrictEqual([
      'origin',
      'main',
      '--force',
    ]);
    expect(matchGitArgs('--set-upstream')).toStrictEqual(['--set-upstream']);
    expect(matchGitArgs('v1.0.0 --force')).toStrictEqual(['v1.0.0', '--force']);
    expect(matchGitArgs('-a -m "release"')).toStrictEqual([
      '-a',
      '-m',
      'release',
    ]);
    expect(matchGitArgs('v1.0.0 -f')).toStrictEqual(['v1.0.0', '-f']);
    expect(matchGitArgs('v1.0.0 -u ABCDEF')).toStrictEqual([
      'v1.0.0',
      '-u',
      'ABCDEF',
    ]);
  });

  it('returns an empty array for blank input', () => {
    expect(matchGitArgs('      ')).toStrictEqual([]);
    expect(matchGitArgs('')).toStrictEqual([]);
  });

  it('rejects --upload-pack with equals value (PoC form)', () => {
    expect(() => matchGitArgs('--upload-pack=touch$IFS/tmp/pwned;')).toThrow(
      /not allowed/,
    );
  });

  it('rejects --upload-pack as a separate flag token', () => {
    expect(() => matchGitArgs('--upload-pack touch /tmp/pwned')).toThrow(
      /not allowed/,
    );
  });

  it('rejects --receive-pack and --exec overrides', () => {
    expect(() => matchGitArgs('--receive-pack=/bin/sh')).toThrow(/not allowed/);
    expect(() => matchGitArgs('--exec=/bin/sh')).toThrow(/not allowed/);
  });

  it('rejects abbreviations of blocked remote-helper options', () => {
    expect(() => matchGitArgs('--upl=evil')).toThrow(/not allowed/);
    expect(() => matchGitArgs('--uplo=evil')).toThrow(/not allowed/);
    expect(() => matchGitArgs('--upload-pac=evil')).toThrow(/not allowed/);
    expect(() => matchGitArgs('--upload=evil')).toThrow(/not allowed/);
    expect(() => matchGitArgs('--rece=evil')).toThrow(/not allowed/);
    expect(() => matchGitArgs('--receive-pac=evil')).toThrow(/not allowed/);
    expect(() => matchGitArgs('--receive=evil')).toThrow(/not allowed/);
    expect(() => matchGitArgs('--e=evil')).toThrow(/not allowed/);
    expect(() => matchGitArgs('--exe=evil')).toThrow(/not allowed/);
  });

  it('rejects remote-helper overrides after -u (fetch/push flag, not a value option)', () => {
    expect(() => matchGitArgs('-u --upl=evil')).toThrow(/not allowed/);
    expect(() => matchGitArgs('-u --upload-pack=evil')).toThrow(/not allowed/);
  });

  it('rejects remote-helper overrides after -m / --message', () => {
    expect(() => matchGitArgs('-m --upl=evil')).toThrow(/not allowed/);
    expect(() => matchGitArgs('--message --exec=evil')).toThrow(/not allowed/);
  });

  it('rejects unmatched quotes that would inject flags via string-argv', () => {
    expect(() => matchGitArgs("origin fix'--force --set-upstream")).toThrow(
      /unmatched ' quote/,
    );
    expect(() => matchGitArgs('origin fix"--force --set-upstream')).toThrow(
      /unmatched " quote/,
    );
  });

  it('parses balanced quotes without treating them as injection', () => {
    expect(matchGitArgs("origin a'b'c --set-upstream")).toStrictEqual([
      'origin',
      "a'b'c",
      '--set-upstream',
    ]);
    expect(matchGitArgs("--longOption 'hello world'")).toStrictEqual([
      '--longOption',
      'hello world',
    ]);
    expect(
      matchGitArgs('--longOption \'This uses the "other" quotes\''),
    ).toStrictEqual(['--longOption', 'This uses the "other" quotes']);
  });

  it('rejects -F / --file message-from-file flags (PoC form)', () => {
    expect(() =>
      matchGitArgs('1.0.0 -F ../runner-secrets/aws-credentials.txt'),
    ).toThrow(/not allowed/);
    expect(() => matchGitArgs('-F ../secrets')).toThrow(/message from a file/);
    expect(() => matchGitArgs('--file=../secrets')).toThrow(
      /message from a file/,
    );
    expect(() => matchGitArgs('--file ../secrets')).toThrow(
      /message from a file/,
    );
  });

  it('rejects --file abbreviations and short-option clusters containing F', () => {
    expect(() => matchGitArgs('--fi=../secrets')).toThrow(
      /message from a file/,
    );
    expect(() => matchGitArgs('--fil=../secrets')).toThrow(
      /message from a file/,
    );
    expect(() => matchGitArgs('-aF ../secrets')).toThrow(/message from a file/);
    expect(() => matchGitArgs('-Fa')).toThrow(/message from a file/);
    expect(() => matchGitArgs('-F../secrets')).toThrow(/message from a file/);
  });

  it('preserves -m / --message values that look like -F/--file', () => {
    expect(matchGitArgs('-m "-F"')).toStrictEqual(['-m', '-F']);
    expect(matchGitArgs('-m --file=/tmp/value')).toStrictEqual([
      '-m',
      '--file=/tmp/value',
    ]);
    expect(matchGitArgs('--message "-F"')).toStrictEqual(['--message', '-F']);
    expect(matchGitArgs('-m-F')).toStrictEqual(['-m-F']);
    expect(matchGitArgs('v1.0.0 -a -m "-F"')).toStrictEqual([
      'v1.0.0',
      '-a',
      '-m',
      '-F',
    ]);
  });

  it('still rejects a real -F after a message value', () => {
    expect(() => matchGitArgs('-m "ok" -F ../secrets')).toThrow(
      /message from a file/,
    );
  });

  it('rejects --pathspec-from-file inline and separate-arg forms', () => {
    expect(() => matchGitArgs('--pathspec-from-file=/path')).toThrow(
      /pathspecs from a file/,
    );
    expect(() => matchGitArgs('--pathspec-from-file /path')).toThrow(
      /pathspecs from a file/,
    );
  });

  it('rejects --pathspec-file-nul alone and combined with --pathspec-from-file', () => {
    expect(() => matchGitArgs('--pathspec-file-nul')).toThrow(
      /pathspecs from a file/,
    );
    expect(() =>
      matchGitArgs('--pathspec-from-file=/path --pathspec-file-nul'),
    ).toThrow(/pathspecs from a file/);
  });

  it('rejects --pathspec-from-file and --pathspec-file-nul abbreviations', () => {
    expect(() => matchGitArgs('--pathspec-fr=/path')).toThrow(
      /pathspecs from a file/,
    );
    expect(() => matchGitArgs('--pathspec-from=/path')).toThrow(
      /pathspecs from a file/,
    );
    expect(() => matchGitArgs('--pathspec-fi')).toThrow(
      /pathspecs from a file/,
    );
    expect(() => matchGitArgs('--pathspec-file')).toThrow(
      /pathspecs from a file/,
    );
  });

  it('preserves -m / --message values that look like --pathspec-from-file', () => {
    expect(matchGitArgs('-m "--pathspec-from-file=/x"')).toStrictEqual([
      '-m',
      '--pathspec-from-file=/x',
    ]);
    expect(matchGitArgs('--message --pathspec-from-file=/x')).toStrictEqual([
      '--message',
      '--pathspec-from-file=/x',
    ]);
  });

  it('still rejects a real --pathspec-from-file after a message value', () => {
    expect(() => matchGitArgs('-m "ok" --pathspec-from-file=/x')).toThrow(
      /pathspecs from a file/,
    );
  });

  it('still rejects --pathspec-from-file when allowUnsafeGitProtocols is true', () => {
    expect(() =>
      matchGitArgs('--pathspec-from-file=/path', {
        allowUnsafeGitProtocols: true,
      }),
    ).toThrow(/pathspecs from a file/);
    expect(() =>
      matchGitArgs('--pathspec-file-nul', {allowUnsafeGitProtocols: true}),
    ).toThrow(/pathspecs from a file/);
  });

  it('rejects scheme:: remote-helper URL tokens (PoC form)', () => {
    expect(() => matchGitArgs('ext::sh -c touch\\ /tmp/pwned')).toThrow(
      /remote-helper URLs/,
    );
    expect(() => matchGitArgs('ext::touch /tmp/pwned')).toThrow(
      /allow_unsafe_git_protocols/,
    );
    expect(() => matchGitArgs('evil::anything')).toThrow(/remote-helper URLs/);
    expect(() => matchGitArgs('origin evil::x --force')).toThrow(
      /remote-helper URLs/,
    );
    expect(() => matchGitArgs("'ext::sh -c touch /tmp/pwned'")).toThrow(
      /remote-helper URLs/,
    );
  });

  it('allows scheme:: tokens when allowUnsafeGitProtocols is true', () => {
    expect(
      matchGitArgs('ext::sh -c true', {allowUnsafeGitProtocols: true}),
    ).toStrictEqual(['ext::sh', '-c', 'true']);
    expect(
      matchGitArgs('evil::anything', {allowUnsafeGitProtocols: true}),
    ).toStrictEqual(['evil::anything']);
    expect(
      matchGitArgs("'ext::sh -c true'", {allowUnsafeGitProtocols: true}),
    ).toStrictEqual(['ext::sh -c true']);
  });

  it('still rejects --upload-pack when allowUnsafeGitProtocols is true', () => {
    expect(() =>
      matchGitArgs('--upload-pack=/bin/sh', {allowUnsafeGitProtocols: true}),
    ).toThrow(/not allowed/);
  });

  it('allows :: inside option values via skipNext', () => {
    expect(matchGitArgs('-m "foo::bar"')).toStrictEqual(['-m', 'foo::bar']);
    expect(matchGitArgs('--message foo::bar')).toStrictEqual([
      '--message',
      'foo::bar',
    ]);
  });
});

describe('pickGitIdentityConfig', () => {
  it('keeps only identity keys', () => {
    const picked = pickGitIdentityConfig({
      'user.name': 'Alice',
      'user.email': 'alice@example.com',
      'author.name': 'Alice',
      'author.email': 'alice@example.com',
      'committer.name': 'Bot',
      'committer.email': 'bot@example.com',
      'http.https://github.com/.extraheader':
        'AUTHORIZATION: basic dGVzdDp0b2tlbg==',
      'credential.helper': 'store',
      'remote.origin.url':
        'https://x-access-token:ghp_secret@github.com/o/r.git',
      'core.sshCommand': 'ssh -i /secrets/id_rsa',
    });

    expect(picked).toStrictEqual({
      'user.name': 'Alice',
      'user.email': 'alice@example.com',
      'author.name': 'Alice',
      'author.email': 'alice@example.com',
      'committer.name': 'Bot',
      'committer.email': 'bot@example.com',
    });
    expect(picked).not.toHaveProperty('http.https://github.com/.extraheader');
    expect(picked).not.toHaveProperty('credential.helper');
    expect(picked).not.toHaveProperty('remote.origin.url');
    expect(picked).not.toHaveProperty('core.sshCommand');
  });

  it('returns an empty object when no identity keys are present', () => {
    expect(
      pickGitIdentityConfig({
        'http.https://github.com/.extraheader':
          'AUTHORIZATION: basic dGVzdDp0b2tlbg==',
      }),
    ).toStrictEqual({});
  });
});

describe('findUnexpectedGitlinks', () => {
  it('returns empty for empty or unrelated output', () => {
    expect(findUnexpectedGitlinks('')).toStrictEqual([]);
    expect(
      findUnexpectedGitlinks(
        ':000000 100644 0000000000000000000000000000000000000000 abcdefabcdefabcdefabcdefabcdefabcdefabcd A\tREADME.md',
      ),
    ).toStrictEqual([]);
  });

  it('flags a newly added gitlink', () => {
    expect(
      findUnexpectedGitlinks(
        ':000000 160000 0000000000000000000000000000000000000000 8ec20b7a40813dbf999aa0c19053ccfe3a72cdd5 A\tevil_nested_repo',
      ),
    ).toStrictEqual(['evil_nested_repo']);
  });

  it('flags a mode change into a gitlink', () => {
    expect(
      findUnexpectedGitlinks(
        ':100644 160000 abcdefabcdefabcdefabcdefabcdefabcdefabcd 8ec20b7a40813dbf999aa0c19053ccfe3a72cdd5 T\twas_a_file',
      ),
    ).toStrictEqual(['was_a_file']);
  });

  it('allows existing submodule SHA updates (160000→160000)', () => {
    expect(
      findUnexpectedGitlinks(
        ':160000 160000 abcdefabcdefabcdefabcdefabcdefabcdefabcd 8ec20b7a40813dbf999aa0c19053ccfe3a72cdd5 M\tvendor/lib',
      ),
    ).toStrictEqual([]);
  });

  it('flags rename/copy into a gitlink and uses the destination path', () => {
    expect(
      findUnexpectedGitlinks(
        ':100644 160000 abcdefabcdefabcdefabcdefabcdefabcdefabcd 8ec20b7a40813dbf999aa0c19053ccfe3a72cdd5 R100\told_name\tnested_renamed',
      ),
    ).toStrictEqual(['nested_renamed']);
    expect(
      findUnexpectedGitlinks(
        ':100644 160000 abcdefabcdefabcdefabcdefabcdefabcdefabcd 8ec20b7a40813dbf999aa0c19053ccfe3a72cdd5 C75\tsrc_file\tnested_copied',
      ),
    ).toStrictEqual(['nested_copied']);
  });

  it('allows rename/copy that stays a gitlink (160000→160000)', () => {
    expect(
      findUnexpectedGitlinks(
        ':160000 160000 abcdefabcdefabcdefabcdefabcdefabcdefabcd 8ec20b7a40813dbf999aa0c19053ccfe3a72cdd5 R100\told_sub\tnew_sub',
      ),
    ).toStrictEqual([]);
  });

  it('collects multiple unexpected gitlinks among mixed changes', () => {
    const raw = [
      ':000000 100644 0000000000000000000000000000000000000000 abcdefabcdefabcdefabcdefabcdefabcdefabcd A\tok.txt',
      ':000000 160000 0000000000000000000000000000000000000000 8ec20b7a40813dbf999aa0c19053ccfe3a72cdd5 A\tnested_a',
      ':160000 160000 abcdefabcdefabcdefabcdefabcdefabcdefabcd fedcbafedcbafedcbafedcbafedcbafedcbafedc M\tok_submodule',
      ':040000 160000 abcdefabcdefabcdefabcdefabcdefabcdefabcd 8ec20b7a40813dbf999aa0c19053ccfe3a72cdd5 T\tnested_b',
    ].join('\n');
    expect(findUnexpectedGitlinks(raw)).toStrictEqual(['nested_a', 'nested_b']);
  });
});

describe('assertNoUnexpectedGitlinks', () => {
  it('does nothing when there are no paths', () => {
    expect(() => assertNoUnexpectedGitlinks([])).not.toThrow();
  });

  it('throws with path names and remediation hints', () => {
    expect(() => assertNoUnexpectedGitlinks(['evil_nested_repo'])).toThrow(
      /unexpected gitlink/,
    );
    expect(() => assertNoUnexpectedGitlinks(['evil_nested_repo'])).toThrow(
      /evil_nested_repo/,
    );
    expect(() => assertNoUnexpectedGitlinks(['evil_nested_repo'])).toThrow(
      /git rm --cached -- evil_nested_repo/,
    );
  });
});

describe('neutralizeLogString', () => {
  it('leaves normal filenames unchanged', () => {
    expect(neutralizeLogString('src/main.ts')).toBe('src/main.ts');
    expect(neutralizeLogString('docs/README.md')).toBe('docs/README.md');
  });

  it('escapes RLO and related bidi controls', () => {
    const rlo = '\u202E';
    const lro = '\u202D';
    const rli = '\u2067';
    expect(neutralizeLogString(`doc${rlo}txt.exe`)).toBe('doc\\u202etxt.exe');
    expect(neutralizeLogString(`a${lro}b${rli}c`)).toBe('a\\u202db\\u2067c');
  });

  it('escapes newlines and other C0 controls', () => {
    expect(neutralizeLogString('line1\nline2')).toBe('line1\\u000aline2');
    expect(neutralizeLogString('a\rb')).toBe('a\\u000db');
  });

  it('escapes line and paragraph separators', () => {
    expect(neutralizeLogString('a\u2028b\u2029c')).toBe('a\\u2028b\\u2029c');
  });

  it('collapses a workflow-command payload onto one escaped line', () => {
    expect(neutralizeLogString('Normal title\n::stop-commands::7a3f9c1e')).toBe(
      'Normal title\\u000a::stop-commands::7a3f9c1e',
    );
  });
});

describe('neutralizeForLog', () => {
  it('recursively sanitizes StatusSummary-shaped objects', () => {
    const rlo = '\u202E';
    const spoofed = `doc${rlo}txt.exe`;
    const input = {
      conflicted: [],
      created: [spoofed],
      modified: ['ok.txt', spoofed],
      files: [{path: spoofed, index: 'A', working_dir: ' '}],
      not_added: 1,
      isClean: () => true,
    };
    const result = neutralizeForLog(input) as typeof input;
    expect(result.created).toStrictEqual(['doc\\u202etxt.exe']);
    expect(result.modified).toStrictEqual(['ok.txt', 'doc\\u202etxt.exe']);
    expect(result.files[0].path).toBe('doc\\u202etxt.exe');
    expect(result.not_added).toBe(1);
  });

  it('sanitizes Error messages', () => {
    const err = new Error('bad: file\u202Ename');
    const result = neutralizeForLog(err) as Error;
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe('bad: file\\u202ename');
  });

  it('passes through nullish and primitives', () => {
    expect(neutralizeForLog(null)).toBeNull();
    expect(neutralizeForLog(undefined)).toBeUndefined();
    expect(neutralizeForLog(42)).toBe(42);
    expect(neutralizeForLog(true)).toBe(true);
  });

  it('returns a marker for circular references', () => {
    const obj: Record<string, unknown> = {path: 'ok.txt'};
    obj.self = obj;
    const arr: unknown[] = ['a'];
    arr.push(arr);

    expect(neutralizeForLog(obj)).toStrictEqual({
      path: 'ok.txt',
      self: '[Circular]',
    });
    expect(neutralizeForLog(arr)).toStrictEqual(['a', '[Circular]']);
  });
});
