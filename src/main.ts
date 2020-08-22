import { info, setFailed, getInput as getInputCore, warning, debug, startGroup, endGroup } from '@actions/core'
import fs from 'fs'
import axios from 'axios'
import simpleGit, { Response } from 'simple-git'

import { Input } from './inputs'

const git = simpleGit({
  baseDir: getInput('cwd'),

});

(async () => {
  await checkInputs()

  startGroup('Internal logs')
  info('Staging files...')
  await add(false)
  await remove(false)

  info('Checking for uncommitted changes in the git working tree...')
  const changedFiles = (await git.diffSummary(['--cached'])).files.length
  if (changedFiles > 0) {
    info(`Found ${changedFiles} changed files.`)

    await setLoginInfo()

    await git.fetch()

    info('Switching/creating branch...')
    await git
      .checkout(getInput('branch'))
      .catch(() => git.checkoutLocalBranch(getInput('branch')))

    info('Pulling from remote...')
    await git
      .fetch()
      .pull()

    info('Resetting files...')
    await git.reset()

    if (getInput('add')) {
      info('Adding files...')
      await add()
    } else info('No files to add.')

    if (getInput('remove')) {
      info('Removing files...')
      await remove()
    } else info('No files to remove.')

    info('Creating commit...')
    await git.commit(getInput('message'), undefined, {
      '--author': `"${getInput('author_name')} <${getInput('author_email')}>"`,
      ...(getInput('signoff') ? {
        '--signoff': null
      } : {})
    })

    if (getInput('tag')) {
      info('Tagging commit...')
      await git.tag(getInput('tag').split(' '))
    } else info('No tag info provided.')

    info('Pushing commit to repo...')
    // @ts-expect-error
    await git.push(`--set-upstream origin "${getInput('branch')}"`.split(' '))

    if (getInput('tag')) {
      info('Pushing tags to repo...')
      // @ts-expect-error
      await git.push(`--set-upstream origin "${getInput('branch')}" --force --tags`.split(' '))
    } else info('No tags to push.')

    endGroup()
    info('Task completed.')
  } else {
    endGroup()
    info('Working tree clean. Nothing to commit.')
  }

})().catch(setFailed)

async function checkInputs() {
  function setDefault(input: string, value: string) {
    const key = 'INPUT_' + input.toUpperCase()
    if (!process.env[key]) process.env[key] = value
    return process.env[key] as string
  }

  const eventPath = process.env.GITHUB_EVENT_PATH,
    event = eventPath && require(eventPath),
    token = process.env.GITHUB_TOKEN,
    isPR = process.env.GITHUB_EVENT_NAME?.includes('pull_request'),
    sha = (event?.pull_request?.head?.sha || process.env.GITHUB_SHA) as string,
    defaultRef = isPR
      ? event?.pull_request?.head?.ref as string
      : process.env.GITHUB_REF?.substring(11)

  if (!token) warning('The GITHUB_TOKEN env variable is missing: the action may not work as expected.')

  const actualRef = setDefault('ref', defaultRef || '')

  let author = event?.head_commit?.author
  if (sha && !author) {
    info('Unable to get commit from workflow event: trying with the GitHub API...')

    // https://docs.github.com/en/rest/reference/repos#get-a-commit--code-samples
    const url = `https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/commits/${sha}`,
      headers = token ? {
        Authorization: `Bearer ${token}`
      } : undefined,
      commit = (await axios.get(url, { headers }).catch(err => {
        info('::group::Request error:')
        info(`Request URL: ${url}`)
        info(err)
        info('::endgroup::')
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

  info(`Using '${getInput('author_name')} <${getInput('author_email')}>' as author.`)
  if (isPR) info(`Running for a PR, the action will use '${actualRef}' as ref.`)
}

function getInput(name: Input) {
  return getInputCore(name)
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
    .addConfig('user.email', getInput('author_email'))
    .addConfig('user.name', getInput('author_name'))
  debug('> Current git config\n' + JSON.stringify((await git.listConfig()).all, null, 2))
}

function add(logWarning = true): Promise<void | Response<void>> {
  return git.add(getInput('add').split(' ')).catch((e: Error) => {
    if (e.message.startsWith('fatal: pathspec') && e.message.endsWith('did not match any files'))
      logWarning && warning('Add command did not match any file.')
    else throw e
  })
}

function remove(logWarning = true) {
  return git.rm(getInput('remove').split(' ')).catch((e: Error) => {
    if (e.message.startsWith('fatal: pathspec') && e.message.endsWith('did not match any files'))
      logWarning && warning('Remove command did not match any file.')
    else throw e
  })
}
