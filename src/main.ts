import * as core from '@actions/core'
import path from 'path'
import simpleGit, { Response } from 'simple-git'
import { checkInputs, getInput, logOutputs, setOutput } from './io'
import { log, matchGitArgs, parseInputArray } from './util'

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
  // continue if there are any changes or if the allow-empty commit argument is included
  if (
    changedFiles > 0 ||
    matchGitArgs(getInput('commit') || '').includes('--allow-empty')
  ) {
    core.info(`> Found ${changedFiles} changed files.`)
    core.debug(
      `--allow-empty argument detected: ${matchGitArgs(
        getInput('commit') || ''
      ).includes('--allow-empty')}`
    )

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

    const targetBranch = getInput('new_branch')
    if (targetBranch) {
      await git
        .checkout(targetBranch)
        .then(() => {
          log(undefined, `'${targetBranch}' branch already existed.`)
        })
        .catch(() => {
          log(undefined, `Creating '${targetBranch}' branch.`)
          return git.checkoutLocalBranch(targetBranch, log)
        })
    }

    const pullOption = getInput('pull')
    if (pullOption) {
      core.info('> Pulling from remote...')
      core.debug(`Current git pull arguments: ${pullOption}`)
      await git
        .fetch(undefined, log)
        .pull(undefined, undefined, matchGitArgs(pullOption), log)
    } else core.info('> Not pulling from repo.')

    core.info('> Creating commit...')
    await git
      .commit(getInput('message'), matchGitArgs(getInput('commit') || ''))
      .then(async (data) => {
        log(undefined, data)
        setOutput('committed', 'true')
        setOutput('commit_sha', data.commit)
        await git
          .revparse(data.commit)
          .then((long_sha) => setOutput('commit_long_sha', long_sha))
          .catch((err) => core.warning(`Couldn't parse long SHA:\n${err}`))
      })
      .catch((err) => core.setFailed(err))

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
          `Running: git push origin ${
            getInput('new_branch') || ''
          } --set-upstream`
        )
        await git.push(
          'origin',
          getInput('new_branch'),
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
          .pushTags('origin', matchGitArgs(getInput('tag_push') || ''))
          .then((data) => {
            setOutput('tag_pushed', 'true')
            return log(null, data)
          })
          .catch((err) => core.setFailed(err))
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

async function add(ignoreErrors: 'all' | 'pathspec' | 'none' = 'none') {
  const input = getInput('add')
  if (!input) return []

  const parsed = parseInputArray(input)
  const res: (string | void)[] = []

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
