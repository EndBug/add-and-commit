import { parseArgsStringToArgv } from 'string-argv'
import { Toolkit } from 'actions-toolkit'

export type Input =
  | 'add'
  | 'author_name'
  | 'author_email'
  | 'branch'
  | 'cwd'
  | 'default_author'
  | 'message'
  | 'pull_strategy'
  | 'push'
  | 'remove'
  | 'signoff'
  | 'tag'

export type Output = 'committed' | 'pushed' | 'tagged'

type RecordOf<T extends string> = Record<T, string | undefined>
export const tools = new Toolkit<RecordOf<Input>, RecordOf<Output>>()
tools.outputs = {
  committed: 'false',
  pushed: 'false',
  tagged: 'false'
}

export function getInput(name: Input) {
  return tools.inputs[name] || ''
}

export async function getUserDisplayName(username?: string) {
  if (!username) return undefined

  const res = await tools.github.users.getByUsername({ username })

  return res?.data?.name
}

export function log(err: any | Error, data?: any) {
  if (data) console.log(data)
  if (err) tools.log.error(err)
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
  tools.log.debug(`Git args parsed:
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
  tools.log.debug(`Setting output: ${name}=${value}`)
  tools.outputs[name] = value
}
