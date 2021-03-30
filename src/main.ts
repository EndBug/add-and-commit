import {
  info,
  setFailed,
  warning,
  debug,
  startGroup,
  endGroup
} from '@actions/core'
import path from 'path'
import simpleGit, { Response } from 'simple-git'
import YAML from 'js-yaml'
import {
  getInput,
  Input,
  log,
  matchGitArgs,
  outputs,
  parseBool,
  setOutput
} from './util'

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

    if (getInput('pull_strategy') == 'NO-PULL') info('> Not pulling from repo.')
    else {
      info('> Pulling from remote...')
      await git.fetch(undefined, log).pull(
        undefined,
        undefined,
        {
          [getInput('pull_strategy')]: null
        },
        log
      )
    }

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
        .tag(matchGitArgs(getInput('tag')), (err, data?) => {
          if (data) setOutput('tagged', 'true')
          return log(err, data)
        })
        .then((data) => {
          setOutput('tagged', 'true')
          return log(null, data)
        })
        .catch((err) => setFailed(err))
    } else info('> No tag info provided.')

    const pushOption = parseBool(getInput('push')) ?? getInput('push')
    if (pushOption) {
      // If the options is `true | string`...
      info('> Pushing commit to repo...')

      if (pushOption === true) {
        debug(`Running: git push origin ${getInput('branch')} --set-upstream`)
        await git.push(
          'origin',
          getInput('branch'),
          { '--set-upstream': null },
          (err, data?) => {
            if (data) setOutput('pushed', 'true')
            return log(err, data)
          }
        )
      } else {
        debug(`Running: git push ${pushOption}`)
        await git.push(
          undefined,
          undefined,
          matchGitArgs(pushOption),
          (err, data?) => {
            if (data) setOutput('pushed', 'true')
            return log(err, data)
          }
        )
      }

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
                  [matchGitArgs(getInput('tag')).filter(
                    (w) => !w.startsWith('-')
                  )[0]]: null
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
    defaultBranch = isPR
      ? (event?.pull_request?.head?.ref as string)
      : process.env.GITHUB_REF?.substring(11)

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
  setDefault('author_name', `${process.env.GITHUB_ACTOR}`)
  setDefault(
    'author_email',
    `${process.env.GITHUB_ACTOR}@users.noreply.github.com`
  )
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

  // #region pull_strategy
  if (getInput('pull_strategy') == 'NO-PULL')
    debug("NO-PULL found: won't pull from remote.")
  // #endregion

  // #region push
  if (getInput('push')) {
    // It has to be either 'true', 'false', or any other string (use as arguments)
    const parsed = parseBool(getInput('push'))

    debug(
      `Current push option: '${getInput('push')}' (parsed as ${typeof parsed})`
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
        .add(matchGitArgs(args), (err: any, data?: any) =>
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
        .rm(matchGitArgs(args), (e: any, d?: any) =>
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
    const yaml = YAML.load(input)
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
