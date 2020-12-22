import {
  info,
  setFailed,
  warning,
  debug,
  startGroup,
  endGroup
} from '@actions/core'
import axios from 'axios'
import path from 'path'
import simpleGit, { Response } from 'simple-git'
import YAML from 'js-yaml'
import { getInput, Input, log, outputs, parseBool, setOutput } from './util'

const baseDir = path.join(process.cwd(), getInput('cwd') || '')
const git = simpleGit({ baseDir })
console.log(`Running in ${baseDir}`)
;(async () => {
  await checkInputs().catch(setFailed)

  startGroup('Internal logs')
  info('> Staging files...')

  if (getInput('add')) {
    info('> Adding files...')
    await add()
  } else info('> No files to add.')

  if (getInput('remove')) {
    info('> Removing files...')
    await remove()
  } else info('> No files to remove.')

  info('> Checking for uncommitted changes in the git working tree...')
  const changedFiles = (await git.diffSummary(['--cached'])).files.length
  if (changedFiles > 0) {
    info(`> Found ${changedFiles} changed files.`)

    await git
      .addConfig('user.email', getInput('author_email'), undefined, log)
      .addConfig('user.name', getInput('author_name'), undefined, log)
    debug(
      '> Current git config\n' +
        JSON.stringify((await git.listConfig()).all, null, 2)
    )

    await git.fetch(['--tags', '--force'], log)

    info('> Switching/creating branch...')
    await git
      .checkout(getInput('branch'), undefined, log)
      .catch(() => git.checkoutLocalBranch(getInput('branch'), log))

    info('> Pulling from remote...')
    await git.fetch(undefined, log).pull(
      undefined,
      undefined,
      {
        [getInput('pull_strategy')]: null
      },
      log
    )

    info('> Re-staging files...')
    if (getInput('add')) await add({ ignoreErrors: true })
    if (getInput('remove')) await remove({ ignoreErrors: true })

    info('> Creating commit...')
    await git.commit(
      getInput('message'),
      undefined,
      {
        '--author': `"${getInput('author_name')} <${getInput(
          'author_email'
        )}>"`,
        ...(getInput('signoff')
          ? {
              '--signoff': null
            }
          : {})
      },
      (err, data?) => {
        if (data) setOutput('committed', 'true')
        return log(err, data)
      }
    )

    if (getInput('tag')) {
      info('> Tagging commit...')
      await git
        .tag(getInput('tag').split(' '), (err, data?) => {
          if (data) setOutput('tagged', 'true')
          return log(err, data)
        })
        .then((data) => {
          setOutput('tagged', 'true')
          return log(null, data)
        })
        .catch((err) => setFailed(err))
    } else info('> No tag info provided.')

    if (getInput('push')) {
      info('> Pushing commit to repo...')
      await git.push(
        'origin',
        getInput('branch'),
        { '--set-upstream': null },
        (err, data?) => {
          if (data) setOutput('pushed', 'true')
          return log(err, data)
        }
      )

      if (getInput('tag')) {
        info('> Pushing tags to repo...')
        await git
          .pushTags('origin', undefined, (e, d?) => log(undefined, e || d))
          .catch(() => {
            info('> Tag push failed: deleting remote tag and re-pushing...')
            return git
              .push(
                undefined,
                undefined,
                {
                  '--delete': null,
                  origin: null,
                  [getInput('tag')
                    .split(' ')
                    .filter((w) => !w.startsWith('-'))[0]]: null
                },
                log
              )
              .pushTags('origin', undefined, log)
          })
      } else info('> No tags to push.')
    } else info('> Not pushing anything.')

    endGroup()
    info('> Task completed.')
  } else {
    endGroup()
    info('> Working tree clean. Nothing to commit.')
  }
})()
  .then(logOutputs)
  .catch((e) => {
    endGroup()
    logOutputs()
    setFailed(e)
  })

async function checkInputs() {
  function setInput(input: Input, value: string | undefined) {
    if (value) return (process.env[`INPUT_${input.toUpperCase()}`] = value)
    else return delete process.env[`INPUT_${input.toUpperCase()}`]
  }
  function setDefault(input: Input, value: string) {
    if (!getInput(input)) setInput(input, value)
    return getInput(input)
  }

  const eventPath = process.env.GITHUB_EVENT_PATH,
    event = eventPath && require(eventPath),
    isPR = process.env.GITHUB_EVENT_NAME?.includes('pull_request'),
    sha = (event?.pull_request?.head?.sha || process.env.GITHUB_SHA) as string,
    defaultBranch = isPR
      ? (event?.pull_request?.head?.ref as string)
      : process.env.GITHUB_REF?.substring(11)

  // #region GITHUB_TOKEN
  let token = process.env.GITHUB_TOKEN
  if (token) {
    warning(
      "The GITHUB_TOKEN env variable is deprecated and will not be supported in the next major release. Use the 'token' input, " +
        "which defaults to 'secrets.GITHUB_TOKEN'."
    )
  } else {
    token = getInput('token')
  }
  // #endregion

  // #region add, remove
  if (!getInput('add') && !getInput('remove'))
    throw new Error(
      "Both 'add' and 'remove' are empty, the action has nothing to do."
    )

  if (getInput('add')) {
    const parsed = parseInputArray(getInput('add'))
    if (parsed.length == 1)
      info('Add input parsed as single string, running 1 git add command.')
    else if (parsed.length > 1)
      info(
        `Add input parsed as string array, running ${parsed.length} git add commands.`
      )
    else setFailed('Add input: array length < 1')
  }
  if (getInput('remove')) {
    const parsed = parseInputArray(getInput('remove'))
    if (parsed.length == 1)
      info('Remove input parsed as single string, running 1 git rm command.')
    else if (parsed.length > 1)
      info(
        `Remove input parsed as string array, running ${parsed.length} git rm commands.`
      )
    else setFailed('Remove input: array length < 1')
  }
  // #endregion

  // #region author_name, author_email
  let author = event?.head_commit?.author
  if (sha && !author) {
    info(
      '> Unable to get commit from workflow event: trying with the GitHub API...'
    )

    // https://docs.github.com/en/rest/reference/repos#get-a-commit--code-samples
    const url = `https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/commits/${sha}`,
      headers = token
        ? {
            Authorization: `Bearer ${token}`
          }
        : undefined,
      commit = (
        await axios.get(url, { headers }).catch((err) => {
          startGroup('Request error:')
          info(`> Request URL: ${url}\b${err}`)
          endGroup()
          return undefined
        })
      )?.data

    author = commit?.commit?.author
  }

  if (author) {
    setDefault('author_name', author.name)
    setDefault('author_email', author.email)
  }

  if (!getInput('author_name') || !getInput('author_email')) {
    const reason = !eventPath
      ? 'event path'
      : isPR
      ? sha
        ? 'fetch commit'
        : 'find commit sha'
      : !event?.head_commit
      ? 'find commit'
      : 'find commit author'
    warning(`Unable to fetch author info: couldn't ${reason}.`)
    setDefault('author_name', 'Add & Commit Action')
    setDefault('author_email', 'actions@github.com')
  }

  info(
    `> Using '${getInput('author_name')} <${getInput(
      'author_email'
    )}>' as author.`
  )
  // #endregion

  // #region message
  setDefault(
    'message',
    `Commit from GitHub Actions (${process.env.GITHUB_WORKFLOW})`
  )
  info(`> Using "${getInput('message')}" as commit message.`)
  // #endregion

  // #region branch
  const branch = setDefault('branch', defaultBranch || '')
  if (isPR) info(`> Running for a PR, the action will use '${branch}' as ref.`)
  // #endregion

  // #region signoff
  if (getInput('signoff')) {
    const parsed = parseBool(getInput('signoff'))

    if (parsed === undefined)
      throw new Error(
        `"${getInput(
          'signoff'
        )}" is not a valid value for the 'signoff' input: only "true" and "false" are allowed.`
      )

    if (!parsed) setInput('signoff', undefined)

    debug(
      `Current signoff option: ${getInput('signoff')} (${typeof getInput(
        'signoff'
      )})`
    )
  }

  // #endregion

  // #region push
  setDefault('push', 'true')
  if (getInput('push')) {
    // It's just to scope the parsed constant
    const parsed = parseBool(getInput('push'))

    if (parsed === undefined)
      throw new Error(
        `"${getInput(
          'push'
        )}" is not a valid value for the 'push' input: only "true" and "false" are allowed.`
      )

    if (!parsed) setInput('push', undefined)

    debug(
      `Current push option: ${getInput('push')} (${typeof getInput('push')})`
    )
  }
  // #endregion
}

async function add({ logWarning = true, ignoreErrors = false } = {}): Promise<
  (void | Response<void>)[]
> {
  const input = getInput('add')
  if (!input) return []

  const parsed = parseInputArray(input)
  const res: (void | Response<void>)[] = []

  for (const args of parsed) {
    res.push(
      // Push the result of every git command (which are executed in order) to the array
      // If any of them fails, the whole function will return a Promise rejection
      await git
        .add(args.split(' '), (err: any, data?: any) =>
          log(ignoreErrors ? null : err, data)
        )
        .catch((e: Error) => {
          if (ignoreErrors) return
          if (
            e.message.includes('fatal: pathspec') &&
            e.message.includes('did not match any files') &&
            logWarning
          )
            warning(`Add command did not match any file:\n  git add ${args}`)
          else throw e
        })
    )
  }

  return res
}

async function remove({
  logWarning = true,
  ignoreErrors = false
} = {}): Promise<(void | Response<void>)[]> {
  const input = getInput('remove')
  if (!input) return []

  const parsed = parseInputArray(input)
  const res: (void | Response<void>)[] = []

  for (const args of parsed) {
    res.push(
      // Push the result of every git command (which are executed in order) to the array
      // If any of them fails, the whole function will return a Promise rejection
      await git
        .rm(args.split(' '), (e: any, d?: any) =>
          log(ignoreErrors ? null : e, d)
        )
        .catch((e: Error) => {
          if (ignoreErrors) return
          if (
            e.message.includes('fatal: pathspec') &&
            e.message.includes('did not match any files')
          )
            logWarning &&
              warning(
                `Remove command did not match any file:\n  git rm ${args}`
              )
          else throw e
        })
    )
  }

  return res
}

/**
 * Tries to parse a JSON array, then a YAML array.
 * If both fail, it returns an array containing the input value as its only element
 */
function parseInputArray(input: string): string[] {
  try {
    const json = JSON.parse(input)
    if (
      json &&
      Array.isArray(json) &&
      json.every((e) => typeof e == 'string')
    ) {
      debug(`Input parsed as JSON array of length ${json.length}`)
      return json
    }
  } catch {}

  try {
    const yaml = YAML.safeLoad(input)
    if (
      yaml &&
      Array.isArray(yaml) &&
      yaml.every((e) => typeof e == 'string')
    ) {
      debug(`Input parsed as YAML array of length ${yaml.length}`)
      return yaml
    }
  } catch {}

  debug('Input parsed as single string')
  return [input]
}

function logOutputs() {
  startGroup('Outputs')
  for (const key in outputs) {
    info(`${key}: ${outputs[key]}`)
  }
  endGroup()
}
