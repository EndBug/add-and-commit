import { parseArgsStringToArgv } from 'string-argv'
import * as core from '@actions/core'
import { Toolkit } from 'actions-toolkit'
import fs from 'fs'

export type Input =
  | 'add'
  | 'author_name'
  | 'author_email'
  | 'branch'
  | 'committer_name'
  | 'committer_email'
  | 'cwd'
  | 'default_author'
  | 'message'
  | 'pull_strategy'
  | 'push'
  | 'remove'
  | 'signoff'
  | 'tag'
  | 'github_token'

export type Output = 'committed' | 'commit_sha' | 'pushed' | 'tagged'

type RecordOf<T extends string> = Record<T, string | undefined>
export const tools = new Toolkit<RecordOf<Input>, RecordOf<Output>>({
  secrets: [
    'GITHUB_EVENT_PATH',
    'GITHUB_EVENT_NAME',
    'GITHUB_REF',
    'GITHUB_ACTOR'
  ]
})
export const outputs: Record<Output, any> = {
  committed: 'false',
  commit_sha: undefined,
  pushed: 'false',
  tagged: 'false'
}

export function getInput(name: Input, bool: true): boolean
export function getInput(name: Input, bool?: false): string
export function getInput(name: Input, bool = false) {
  if (bool) return core.getBooleanInput(name)
  return tools.inputs[name] || ''
}

export async function getUserInfo(username?: string) {
  if (!username) return undefined

  const res = await tools.github.users.getByUsername({ username })

  core.debug(
    `Fetched github actor from the API: ${JSON.stringify(res?.data, null, 2)}`
  )

  return {
    name: res?.data?.name,
    email: res?.data?.email
  }
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

export function readJSON(filePath: string) {
  let fileContent: string
  try {
    fileContent = fs.readFileSync(filePath, { encoding: 'utf8' })
  } catch {
    throw `Couldn't read file. File path: ${filePath}`
  }

  try {
    return JSON.parse(fileContent)
  } catch {
    throw `Couldn't parse file to JSON. File path: ${filePath}`
  }
}

export function setOutput<T extends Output>(name: T, value: typeof outputs[T]) {
  core.debug(`Setting output: ${name}=${value}`)
  outputs[name] = value
  core.setOutput(name, value)
}

// Setup default output values
Object.entries(outputs).forEach(([name, value]) => core.setOutput(name, value))
