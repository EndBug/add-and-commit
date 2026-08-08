import {
  assertValidBranchName,
  matchGitArgs,
  parseInputArray,
} from '../src/util';

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
});
