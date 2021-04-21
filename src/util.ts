import * as core from '@actions/core'
import { parseArgsStringToArgv } from 'string-argv'

export type Input =
  | 'add'
  | 'author_name'
  | 'author_email'
  | 'branch'
  | 'cwd'
  | 'message'
  | 'pull_strategy'
  | 'push'
  | 'remove'
  | 'signoff'
  | 'tag'

export const outputs = {
  committed: 'false',
  pushed: 'false',
  tagged: 'false'
}
export type Output = keyof typeof outputs

export function getInput(name: Input) {
  return core.getInput(name)
}

export function log(err: any | Error, data?: any) {
  if (data) console.log(data)
  if (err) core.error(err)
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
  const parsed = parseArgsStringToArgv(string)
  core.debug(`Git args parsed:
  - Original: ${string}
  - Parsed: ${JSON.stringify(parsed)}`)
  return parsed
}

export function parseBool(value: any) {
  try {
    const parsed = JSON.parse(value)
    if (typeof parsed == 'boolean') return parsed
  } catch {}
}

export function setOutput(name: Output, value: 'true' | 'false') {
  core.debug(`Setting output: ${name}=${value}`)
  outputs[name] = value
  return core.setOutput(name, value)
}
for (const key in outputs) setOutput(key as Output, outputs[key])
