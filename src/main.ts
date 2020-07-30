import { info, setFailed, getInput, warning, debug } from '@actions/core'
import { execFile } from 'child_process'
import { join } from 'path'

try {
  checkInputs()
  const child = execFile(join(__dirname, 'entrypoint.sh'), [], { shell: true })
  child.stdout?.pipe(process.stdout)
  child.stderr?.pipe(process.stderr)
} catch (err) {
  console.error(err)
  setFailed(err instanceof Error ? err.message : err)
}

function checkInputs() {
  const eventPath = process.env.GITHUB_EVENT_PATH,
    event = eventPath && require(eventPath),
    author = event?.head_commit?.author

  if (author) {
    setDefault('author_name', author.name)
    setDefault('author_email', author.email)
  } else {
    if (!getInput('author_name') || !getInput('author_email')) warning(`Unable to fetch author info: couldn't find ${!eventPath ? 'event path' : !require(eventPath)?.head_commit ? 'commit' : 'commit author'}.`)
    setDefault('author_name', 'Add & Commit Action')
    setDefault('author_email', 'actions@github.com')
  }

  const isPR = process.env.GITHUB_EVENT_NAME?.includes('pull_request'),
    defaultRef = isPR
      ? event?.pull_request?.head?.ref as string
      : process.env.GITHUB_REF?.substring(11)

  const actualRef = setDefault('ref', defaultRef || '')

  debug(process.env.GITHUB_EVENT_NAME || '')
  debug(isPR + '')
  debug(actualRef)

  info(`Using '${getInput('author_name')} <${getInput('author_email')}>' as author.`)
  if (isPR) info(`Running for a PR, the action will use '${actualRef}' as ref.`)
}

function setDefault(input: string, value: string) {
  const key = 'INPUT_' + input.toUpperCase()
  if (!process.env[key]) process.env[key] = value
  return process.env[key] as string
}
