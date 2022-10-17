import * as core from '@actions/core'
import { getUserInfo, parseInputArray } from './util'

interface InputTypes {
  add: string
  author_name: string
  author_email: string
  commit: string | undefined
  committer_name: string
  committer_email: string
  cwd: string
  default_author: 'github_actor' | 'user_info' | 'github_actions'
  fetch: string
  message: string
  new_branch: string | undefined
  pathspec_error_handling: 'ignore' | 'exitImmediately' | 'exitAtEnd'
  pull: string | undefined
  push: string
  remove: string | undefined
  tag: string | undefined
  tag_push: string | undefined

  github_token: string | undefined
}
export type input = keyof InputTypes

interface OutputTypes {
  committed: 'true' | 'false'
  commit_long_sha: string | undefined
  commit_sha: string | undefined
  pushed: 'true' | 'false'
  tagged: 'true' | 'false'
  tag_pushed: 'true' | 'false'
}
export type output = keyof OutputTypes

export const outputs: OutputTypes = {
  committed: 'false',
  commit_long_sha: undefined,
  commit_sha: undefined,
  pushed: 'false',
  tagged: 'false',
  tag_pushed: 'false'
}
// Setup default output values
Object.entries(outputs).forEach(([name, value]) => core.setOutput(name, value))

export function getInput<T extends input>(name: T, parseAsBool: true): boolean
export function getInput<T extends input>(
  name: T,
  parseAsBool?: false
): InputTypes[T]
export function getInput<T extends input>(
  name: T,
  parseAsBool = false
): InputTypes[T] | boolean {
  if (parseAsBool) return core.getBooleanInput(name)
  // @ts-expect-error
  return core.getInput(name)
}

export function setOutput<T extends output>(name: T, value: OutputTypes[T]) {
  core.debug(`Setting output: ${name}=${value}`)
  outputs[name] = value
  core.setOutput(name, value)
}

export function logOutputs() {
  core.startGroup('Outputs')
  for (const key in outputs) {
    core.info(`${key}: ${outputs[key]}`)
  }
  core.endGroup()
}

export async function checkInputs() {
  function setInput(input: input, value: string | undefined) {
    if (value) return (process.env[`INPUT_${input.toUpperCase()}`] = value)
    else return delete process.env[`INPUT_${input.toUpperCase()}`]
  }
  function setDefault(input: input, value: string) {
    if (!getInput(input)) setInput(input, value)
    return getInput(input)
  }

  // #region add, remove
  if (!getInput('add') && !getInput('remove'))
    throw new Error(
      "Both 'add' and 'remove' are empty, the action has nothing to do."
    )

  if (getInput('add')) {
    const parsed = parseInputArray(getInput('add'))
    if (parsed.length == 1)
      core.info('Add input parsed as single string, running 1 git add command.')
    else if (parsed.length > 1)
      core.info(
        `Add input parsed as string array, running ${parsed.length} git add commands.`
      )
    else core.setFailed('Add input: array length < 1')
  }
  if (getInput('remove')) {
    const parsed = parseInputArray(getInput('remove') || '')
    if (parsed.length == 1)
      core.info(
        'Remove input parsed as single string, running 1 git rm command.'
      )
    else if (parsed.length > 1)
      core.info(
        `Remove input parsed as string array, running ${parsed.length} git rm commands.`
      )
    else core.setFailed('Remove input: array length < 1')
  }
  // #endregion

  // #region default_author
  const default_author_valid = ['github_actor', 'user_info', 'github_actions']
  if (!default_author_valid.includes(getInput('default_author')))
    throw new Error(
      `'${getInput(
        'default_author'
      )}' is not a valid value for default_author. Valid values: ${default_author_valid.join(
        ', '
      )}`
    )
  // #endregion

  // #region fetch
  if (getInput('fetch')) {
    let value: string | boolean

    try {
      value = getInput('fetch', true)
    } catch {
      value = getInput('fetch')
    }

    core.debug(`Current fetch option: '${value}' (parsed as ${typeof value})`)
  }
  // #endregion

  // #region author_name, author_email
  let name, email
  switch (getInput('default_author')) {
    case 'github_actor': {
      name = process.env.GITHUB_ACTOR
      email = `${process.env.GITHUB_ACTOR}@users.noreply.github.com`
      break
    }

    case 'user_info': {
      if (!getInput('author_name') || !getInput('author_email')) {
        const res = await getUserInfo(process.env.GITHUB_ACTOR)
        if (!res?.name)
          core.warning("Couldn't fetch author name, filling with github_actor.")
        if (!res?.email)
          core.warning(
            "Couldn't fetch author email, filling with github_actor."
          )

        res?.name && (name = res?.name)
        res?.email && (email = res.email)
        if (name && email) break
      }

      !name && (name = process.env.GITHUB_ACTOR)
      !email && (email = `${process.env.GITHUB_ACTOR}@users.noreply.github.com`)
      break
    }

    case 'github_actions': {
      name = 'github-actions'
      email = '41898282+github-actions[bot]@users.noreply.github.com'
      break
    }

    default:
      throw new Error(
        'This should not happen, please contact the author of this action. (checkInputs.author)'
      )
  }

  setDefault('author_name', name)
  setDefault('author_email', email)
  core.info(
    `> Using '${getInput('author_name')} <${getInput(
      'author_email'
    )}>' as author.`
  )
  // #endregion

  // #region committer_name, committer_email
  if (getInput('committer_name') || getInput('committer_email'))
    core.info(
      `> Using custom committer info: ${
        getInput('committer_name') ||
        getInput('author_name') + ' [from author info]'
      } <${
        getInput('committer_email') ||
        getInput('author_email') + ' [from author info]'
      }>`
    )

  setDefault('committer_name', getInput('author_name'))
  setDefault('committer_email', getInput('author_email'))
  core.debug(
    `Committer: ${getInput('committer_name')} <${getInput('committer_email')}>`
  )
  // #endregion

  // #region message
  setDefault(
    'message',
    `Commit from GitHub Actions (${process.env.GITHUB_WORKFLOW})`
  )
  core.info(`> Using "${getInput('message')}" as commit message.`)
  // #endregion

  // #region pathspec_error_handling
  const peh_valid = ['ignore', 'exitImmediately', 'exitAtEnd']
  if (!peh_valid.includes(getInput('pathspec_error_handling')))
    throw new Error(
      `"${getInput(
        'pathspec_error_handling'
      )}" is not a valid value for the 'pathspec_error_handling' input. Valid values are: ${peh_valid.join(
        ', '
      )}`
    )
  // #endregion

  // #region push
  if (getInput('push')) {
    // It has to be either 'true', 'false', or any other string (use as arguments)
    let value: string | boolean

    try {
      value = getInput('push', true)
    } catch {
      value = getInput('push')
    }

    core.debug(`Current push option: '${value}' (parsed as ${typeof value})`)
  }
  // #endregion

  // #region github_token
  if (!getInput('github_token'))
    core.warning(
      'No github_token has been detected, the action may fail if it needs to use the API'
    )
  // #endregion
}
