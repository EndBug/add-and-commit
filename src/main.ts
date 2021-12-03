import * as core from '@actions/core'
import path from 'path'
import simpleGit, { CommitSummary, Response } from 'simple-git'
import YAML from 'js-yaml'
import {
  getInput,
  getUserInfo,
  input,
  log,
  matchGitArgs,
  outputs,
  readJSON,
  setOutput
} from './util'

const baseDir = path.join(process.cwd(), getInput('cwd') || '')
const git = simpleGit({ baseDir })

const exitErrors: Error[] = []

core.info(`Running in ${baseDir}`)
;(async () => {
  await checkInputs()

  core.startGroup('Internal logs')
  core.info('> Staging files...')

  const peh = getInput('pathspec_error_handling')

  if (getInput('add')) {
    core.info('> Adding files...')
    await add(peh == 'ignore' ? 'pathspec' : 'none')
  } else core.info('> No files to add.')

  if (getInput('remove')) {
    core.info('> Removing files...')
    await remove(peh == 'ignore' ? 'pathspec' : 'none')
  } else core.info('> No files to remove.')

  core.info('> Checking for uncommitted changes in the git working tree...')
  const changedFiles = (await git.diffSummary(['--cached'])).files.length
  if (changedFiles > 0) {
    core.info(`> Found ${changedFiles} changed files.`)

    await git
      .addConfig('user.email', getInput('author_email'), undefined, log)
      .addConfig('user.name', getInput('author_name'), undefined, log)
      .addConfig('author.email', getInput('author_email'), undefined, log)
      .addConfig('author.name', getInput('author_name'), undefined, log)
      .addConfig('committer.email', getInput('committer_email'), undefined, log)
      .addConfig('committer.name', getInput('committer_name'), undefined, log)
    core.debug(
      '> Current git config\n' +
        JSON.stringify((await git.listConfig()).all, null, 2)
    )

    await git.fetch(['--tags', '--force'], log)

    core.info('> Switching/creating branch...')
    /** This should store whether the branch already existed, of if a new one was created */
    let branchType!: 'existing' | 'new'
    await git
      .checkout(getInput('branch'))
      .then(() => (branchType = 'existing'))
      .catch(() => {
        if (getInput('branch_mode') == 'create') {
          log(
            undefined,
            `'${getInput('branch')}' branch not found, trying to create one.`
          )
          branchType = 'new'
          return git.checkoutLocalBranch(getInput('branch'), log)
        } else throw `'${getInput('branch')}' branch not found.`
      })

    /* 
      The current default value is set here: it will not pull when it has 
      created a new branch, it will use --rebase when the branch already existed 
    */
    const pull =
      getInput('pull') ||
      getInput('pull_strategy') ||
      (branchType == 'new' ? 'NO-PULL' : '--no-rebase')
    if (pull == 'NO-PULL') core.info('> Not pulling from repo.')
    else {
      core.info('> Pulling from remote...')
      core.debug(`Current git pull arguments: ${pull}`)
      await git
        .fetch(undefined, log)
        .pull(undefined, undefined, matchGitArgs(pull), log)
    }

    core.info('> Re-staging files...')
    if (getInput('add')) await add('all')
    if (getInput('remove')) await remove('all')

    core.info('> Creating commit...')
    await git.commit(
      getInput('message'),
      matchGitArgs(getInput('commit') || ''),
      (err, data?: CommitSummary) => {
        if (data) {
          setOutput('committed', 'true')
          setOutput('commit_sha', data.commit)
        }
        return log(err, data)
      }
    )

    if (getInput('tag')) {
      core.info('> Tagging commit...')
      await git
        .tag(matchGitArgs(getInput('tag') || ''), (err, data?) => {
          if (data) setOutput('tagged', 'true')
          return log(err, data)
        })
        .then((data) => {
          setOutput('tagged', 'true')
          return log(null, data)
        })
        .catch((err) => core.setFailed(err))
    } else core.info('> No tag info provided.')

    let pushOption: string | boolean
    try {
      pushOption = getInput('push', true)
    } catch {
      pushOption = getInput('push')
    }
    if (pushOption) {
      // If the options is `true | string`...
      core.info('> Pushing commit to repo...')

      if (pushOption === true) {
        core.debug(
          `Running: git push origin ${getInput('branch')} --set-upstream`
        )
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
        core.debug(`Running: git push ${pushOption}`)
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
        core.info('> Pushing tags to repo...')
        await git
          .pushTags('origin', undefined, (e, d?) => log(undefined, e || d))
          .catch(() => {
            core.info(
              '> Tag push failed: deleting remote tag and re-pushing...'
            )
            return git
              .push(
                undefined,
                undefined,
                {
                  '--delete': null,
                  origin: null,
                  [matchGitArgs(getInput('tag') || '').filter(
                    (w) => !w.startsWith('-')
                  )[0]]: null
                },
                log
              )
              .pushTags('origin', undefined, log)
          })
      } else core.info('> No tags to push.')
    } else core.info('> Not pushing anything.')

    core.endGroup()
    core.info('> Task completed.')
  } else {
    core.endGroup()
    core.info('> Working tree clean. Nothing to commit.')
  }
})()
  .then(() => {
    // Check for exit errors
    if (exitErrors.length == 1) throw exitErrors[0]
    else if (exitErrors.length > 1) {
      exitErrors.forEach((e) => core.error(e))
      throw 'There have been multiple runtime errors.'
    }
  })
  .then(logOutputs)
  .catch((e) => {
    core.endGroup()
    logOutputs()
    core.setFailed(e)
  })

async function checkInputs() {
  function setInput(input: input, value: string | undefined) {
    if (value) return (process.env[`INPUT_${input.toUpperCase()}`] = value)
    else return delete process.env[`INPUT_${input.toUpperCase()}`]
  }
  function setDefault(input: input, value: string) {
    if (!getInput(input)) setInput(input, value)
    return getInput(input)
  }

  const eventPath = process.env.GITHUB_EVENT_PATH,
    event = eventPath && readJSON(eventPath)

  const isPR = process.env.GITHUB_EVENT_NAME?.includes('pull_request'),
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

  // #region branch
  const branch = setDefault('branch', defaultBranch || '')
  if (isPR)
    core.info(`> Running for a PR, the action will use '${branch}' as ref.`)
  // #endregion

  // #region branch_mode
  const branch_mode_valid = ['throw', 'create']
  if (!branch_mode_valid.includes(getInput('branch_mode')))
    throw new Error(
      `"${getInput(
        'branch_mode'
      )}" is not a valid value for the 'branch_mode' input. Valid values are: ${branch_mode_valid.join(
        ', '
      )}`
    )
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

  // #region pull, pull_strategy [deprecated]
  if (getInput('pull') && getInput('pull_strategy'))
    throw new Error(
      "You can't use both pull and pull_strategy as action inputs. Please remove pull_strategy, which is deprecated."
    )

  if ([getInput('pull'), getInput('pull_strategy')].includes('NO-PULL'))
    core.debug("NO-PULL found: won't pull from remote.")
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

async function add(
  ignoreErrors: 'all' | 'pathspec' | 'none' = 'none'
): Promise<(void | Response<void>)[]> {
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
          log(ignoreErrors == 'all' ? null : err, data)
        )
        .catch((e: Error) => {
          // if I should ignore every error, return
          if (ignoreErrors == 'all') return

          // if it's a pathspec error...
          if (
            e.message.includes('fatal: pathspec') &&
            e.message.includes('did not match any files')
          ) {
            if (ignoreErrors == 'pathspec') return

            const peh = getInput('pathspec_error_handling'),
              err = new Error(
                `Add command did not match any file: git add ${args}`
              )
            if (peh == 'exitImmediately') throw err
            if (peh == 'exitAtEnd') exitErrors.push(err)
          } else throw e
        })
    )
  }

  return res
}

async function remove(
  ignoreErrors: 'all' | 'pathspec' | 'none' = 'none'
): Promise<(void | Response<void>)[]> {
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
          log(ignoreErrors == 'all' ? null : e, d)
        )
        .catch((e: Error) => {
          // if I should ignore every error, return
          if (ignoreErrors == 'all') return

          // if it's a pathspec error...
          if (
            e.message.includes('fatal: pathspec') &&
            e.message.includes('did not match any files')
          ) {
            if (ignoreErrors == 'pathspec') return

            const peh = getInput('pathspec_error_handling'),
              err = new Error(
                `Remove command did not match any file:\n  git rm ${args}`
              )
            if (peh == 'exitImmediately') throw err
            if (peh == 'exitAtEnd') exitErrors.push(err)
          } else throw e
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
      core.debug(`Input parsed as JSON array of length ${json.length}`)
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
      core.debug(`Input parsed as YAML array of length ${yaml.length}`)
      return yaml
    }
  } catch {}

  core.debug('Input parsed as single string')
  return [input]
}

function logOutputs() {
  core.startGroup('Outputs')
  for (const key in outputs) {
    core.info(`${key}: ${outputs[key]}`)
  }
  core.endGroup()
}
