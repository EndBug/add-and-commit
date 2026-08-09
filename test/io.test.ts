import {parsePushAttempts} from '../src/io';

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
