import * as core from '@actions/core'
import matchAll from 'string.prototype.matchall'

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
 * Matches the different pathspecs and arguments by removing spaces that are not inside quotes
 * @example
 * ```js
 * matchGitArgs(`--message "This is a 'quoted' message" --other 'This uses the "other" quotes' --foo 1234`) => ["--message", "This is a 'quoted' message", "--other", "This uses the \"other\" quotes", "--foo", "1234"]
 * matchGitArgs('      ') => [ ]
 * ```
 * @returns An array, if there's no match it'll be empty
 */
export function matchGitArgs(string: string) {
  const tokens = String.raw`
    (?<option> --\w+)
    | (' (?<sq> (\\. | [^'])* ) ')
    | (" (?<dq> (\\. | [^"])* ) ")
    | (?<raw> \S+)
`

  const re = tokens.replace(/\s+/g, '')

  const result: string[] = []

  for (const m of matchAll(string, re)) {
    result.push(...Object.values(m.groups || {}).filter(Boolean))
  }

  return result
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
