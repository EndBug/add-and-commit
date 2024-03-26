import {parseArgsStringToArgv} from 'string-argv';
import * as core from '@actions/core';
import * as YAML from 'js-yaml';
import {Toolkit} from 'actions-toolkit';
import * as fs from 'fs';
import {input, output} from './io';

type RecordOf<T extends string> = Record<T, string | undefined>;
export const tools = new Toolkit<RecordOf<input>, RecordOf<output>>({
  secrets: [
    'GITHUB_EVENT_PATH',
    'GITHUB_EVENT_NAME',
    'GITHUB_REF',
    'GITHUB_ACTOR',
  ],
});

export async function getUserInfo(username?: string) {
  if (!username) return undefined;

  const res = await tools.github.users.getByUsername({username});

  core.debug(
    `Fetched github actor from the API: ${JSON.stringify(res?.data, null, 2)}`
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
 */
export function matchGitArgs(string: string) {
  const parsed = parseArgsStringToArgv(string);
  core.debug(`Git args parsed:
  - Original: ${string}
  - Parsed: ${JSON.stringify(parsed)}`);
  return parsed;
}

/**
 * Tries to parse a JSON array, then a YAML array.
 * If both fail, it returns an array containing the input value as its only element
 */
export function parseInputArray(input: string): string[] {
  core.debug(`Parsing input array: ${input}`);
  try {
    const json = JSON.parse(input);
    if (json && Array.isArray(json) && json.every(e => typeof e === 'string')) {
      core.debug(`Input parsed as JSON array of length ${json.length}`);
      return json;
    }
  } catch {
    return [];
  }

  try {
    const yaml = YAML.load(input);
    if (yaml && Array.isArray(yaml) && yaml.every(e => typeof e === 'string')) {
      core.debug(`Input parsed as YAML array of length ${yaml.length}`);
      return yaml;
    }
  } catch {
    return [];
  }

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
