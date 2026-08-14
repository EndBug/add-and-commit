import {parseBoolOrGitArgs, parsePushAttempts} from '../src/io';

describe('parseBoolOrGitArgs', () => {
  const original = process.env.INPUT_PULL;

  afterEach(() => {
    if (original === undefined) delete process.env.INPUT_PULL;
    else process.env.INPUT_PULL = original;
  });

  it('parses true/false as booleans', () => {
    process.env.INPUT_PULL = 'true';
    expect(parseBoolOrGitArgs('pull')).toBe(true);

    process.env.INPUT_PULL = 'false';
    expect(parseBoolOrGitArgs('pull')).toBe(false);
  });

  it('returns git-args strings unchanged', () => {
    process.env.INPUT_PULL = '--rebase --autostash';
    expect(parseBoolOrGitArgs('pull')).toBe('--rebase --autostash');
  });

  it('returns an empty string when unset', () => {
    delete process.env.INPUT_PULL;
    expect(parseBoolOrGitArgs('pull')).toBe('');
  });
});

describe('parsePushAttempts', () => {
  it('accepts positive integers', () => {
    expect(parsePushAttempts('1')).toBe(1);
    expect(parsePushAttempts('3')).toBe(3);
    expect(parsePushAttempts(' 10 ')).toBe(10);
    expect(parsePushAttempts('+2')).toBe(2);
  });

  it('rejects non-integers and values below 1', () => {
    expect(() => parsePushAttempts('0')).toThrow(/positive integer/);
    expect(() => parsePushAttempts('-1')).toThrow(/positive integer/);
    expect(() => parsePushAttempts('1.5')).toThrow(/positive integer/);
    expect(() => parsePushAttempts('true')).toThrow(/positive integer/);
    expect(() => parsePushAttempts('')).toThrow(/positive integer/);
    expect(() => parsePushAttempts('1e2')).toThrow(/positive integer/);
  });
});
