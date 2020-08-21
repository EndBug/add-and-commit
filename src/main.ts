import { info, setFailed, getInput, warning } from '@actions/core'
import { execFile } from 'child_process'
import path from 'path'
import axios from 'axios'

checkInputs().then(() => {
  const child = execFile(path.join(__dirname, 'entrypoint.sh'), [], { shell: true })
  child.stdout?.pipe(process.stdout)
  child.stderr?.pipe(process.stderr)
}).catch(err => {
  console.error(err)
  setFailed(err instanceof Error ? err.message : err)
})

async function checkInputs() {
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

function setDefault(input: string, value: string) {
  const key = 'INPUT_' + input.toUpperCase()
  if (!process.env[key]) process.env[key] = value
  return process.env[key] as string
}
