import {assertValidBranchName, parseInputArray} from '../src/util';

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
});
