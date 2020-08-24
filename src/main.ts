import { info, setFailed, getInput as getInputCore, warning, debug, startGroup, endGroup, error } from '@actions/core'
import fs from 'fs'
import axios from 'axios'
import simpleGit, { Response } from 'simple-git'

import { Input } from './inputs'

const git = simpleGit({
  baseDir: getInput('cwd')
});

(async () => {
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

    await setLoginInfo()

    await git.fetch(['--tags', '--force'], log)

    info('> Switching/creating branch...')
    await git
      .checkout(getInput('branch'), undefined, log)
      .catch(() => git.checkoutLocalBranch(getInput('branch'), log))

    info('> Pulling from remote...')
    await git
      .fetch(undefined, log)
      .pull(undefined, undefined, undefined, log)

    info('> Re-staging files...')
    if (getInput('add')) await add({ ignoreErrors: true })
    if (getInput('remove')) await remove({ ignoreErrors: true })

    info('> Creating commit...')
    await git.commit(getInput('message'), undefined, {
      '--author': `"${getInput('author_name')} <${getInput('author_email')}>"`,
      ...(getInput('signoff') ? {
        '--signoff': null
      } : {})
    }, log)

    if (getInput('tag')) {
      info('> Tagging commit...')
      await git.tag(getInput('tag').split(' '), log)
    } else info('> No tag info provided.')

    info('> Pushing commit to repo...')
    await git.push('origin', getInput('branch'), { '--set-upstream': null }, log)

    if (getInput('tag')) {
      info('> Pushing tags to repo...')
      await git.pushTags('origin', log).catch(() => {
        info('> Tag push failed: deleting remote tag and re-pushing...')
        return git.push(undefined, undefined, { '--delete': null, 'origin': null, [getInput('tag')]: null })
          .pushTags('origin', log)
      })
    } else info('> No tags to push.')

    endGroup()
    info('> Task completed.')
  } else {
    endGroup()
    info('> Working tree clean. Nothing to commit.')
  }
})().catch(e => {
  endGroup()
  setFailed(e)
})

async function checkInputs() {
  function setInput(input: Input, value: string | undefined) {
    if (value) return process.env[`INPUT_${input.toUpperCase()}`] = value
    else return delete process.env[`INPUT_${input.toUpperCase()}`]
  }
  function setDefault(input: Input, value: string) {
    if (!getInput(input)) setInput(input, value)
    return getInput(input)
  }

  const eventPath = process.env.GITHUB_EVENT_PATH,
    event = eventPath && require(eventPath),
    token = process.env.GITHUB_TOKEN,
    isPR = process.env.GITHUB_EVENT_NAME?.includes('pull_request'),
    sha = (event?.pull_request?.head?.sha || process.env.GITHUB_SHA) as string,
    defaultBranch = isPR
      ? event?.pull_request?.head?.ref as string
      : process.env.GITHUB_REF?.substring(11)

  // #region GITHUB_TOKEN
  if (!token) warning('The GITHUB_TOKEN env variable is missing: the action may not work as expected.')
  // #endregion

  // #region add, remove
  if (!getInput('add') && !getInput('remove'))
    throw new Error('Both \'add\' and \'remove\' are empty, the action has nothing to do.')
  // #endregion

  // #region author_name, author_email
  let author = event?.head_commit?.author
  if (sha && !author) {
    info('> Unable to get commit from workflow event: trying with the GitHub API...')

    // https://docs.github.com/en/rest/reference/repos#get-a-commit--code-samples
    const url = `https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/commits/${sha}`,
      headers = token ? {
        Authorization: `Bearer ${token}`
      } : undefined,
      commit = (await axios.get(url, { headers }).catch(err => {
        startGroup('Request error:')
        info(`> Request URL: ${url}\b${err}`)
        endGroup()
        return undefined
      }))?.data

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

  info(`> Using '${getInput('author_name')} <${getInput('author_email')}>' as author.`)
  // #endregion

  // #region branch
  const branch = setDefault('branch', defaultBranch || '')
  if (isPR) info(`> Running for a PR, the action will use '${branch}' as ref.`)
  // #endregion

  // #region signoff
  if (getInput('signoff')) try {
    const parsed = JSON.parse(getInput('signoff'))
    if (typeof parsed == 'boolean' && !parsed)
      setInput('signoff', undefined)
    debug(`Current signoff option: ${getInput('signoff')} (${typeof getInput('signoff')})`)
  } catch {
    throw new Error(`"${getInput('signoff')}" is not a valid value for the 'signoff' input: only "true" and "false" are allowed.`)
  }
  // #endregion
}

function getInput(name: Input) {
  return getInputCore(name)
}

function log(err: any | Error, data?: any) {
  if (data) console.log(data)
  if (err) error(err)
}

async function setLoginInfo() {
  const myConfig = `
  machine github.com
  login $GITHUB_ACTOR
  password $GITHUB_TOKEN

  machine api.github.com
  login $GITHUB_ACTOR
  password $GITHUB_TOKEN
  `.trim(),
    configFilePath = `${process.env.HOME}/.netrc`

  let nextConfig = ''
  try {
    nextConfig = fs.readFileSync(configFilePath, { encoding: 'utf8' })
    nextConfig += '\n' + myConfig
  } catch {
    nextConfig = myConfig
  }

  fs.writeFileSync(configFilePath, nextConfig)
  debug(`> Current .netrc\n${nextConfig}`)

  await git
    .addConfig('user.email', getInput('author_email'), undefined, log)
    .addConfig('user.name', getInput('author_name'), undefined, log)
  debug('> Current git config\n' + JSON.stringify((await git.listConfig()).all, null, 2))
}

function add({ logWarning = true, ignoreErrors = false } = {}): Promise<void | Response<void>> | void {
  if (getInput('add'))
    return git.add(getInput('add').split(' '), (e: any, d?: any) => log(ignoreErrors ? null : e, d)).catch((e: Error) => {
      if (ignoreErrors) return
      if (e.message.includes('fatal: pathspec') && e.message.includes('did not match any files'))
        logWarning && warning('Add command did not match any file.')
      else throw e
    })
}

function remove({ logWarning = true, ignoreErrors = false } = {}): Promise<void | Response<void>> | void {
  if (getInput('remove'))
    return git.rm(getInput('remove').split(' '), (e: any, d?: any) => log(ignoreErrors ? null : e, d)).catch((e: Error) => {
      if (ignoreErrors) return
      if (e.message.includes('fatal: pathspec') && e.message.includes('did not match any files'))
        logWarning && warning('Remove command did not match any file.')
      else throw e
    })
}
