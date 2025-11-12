import {parseInputArray} from '../src/util';

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
