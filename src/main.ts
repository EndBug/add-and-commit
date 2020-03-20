import { info, setFailed, getInput, warning } from '@actions/core'
import { join as path } from 'path'
import { execFileSync } from 'child_process'

try {
  checkInputs()
  execFileSync(path(__dirname, 'entrypoint.sh'))
} catch (err) {
  setFailed(err)
}

function checkInputs() {
  const eventPath = process.env.GITHUB_EVENT_PATH
  const author = eventPath && require(eventPath)?.head_commit?.author

  if (author) {
    setDefault('author_name', author.name)
    setDefault('author_email', author.email)
  } else {
    warning(`Unable to fetch author info: couldn't find ${!eventPath ? 'event path' : !require(eventPath)?.head_commit ? 'commit' : 'commit author'}.`)
    setDefault('author_name', 'Add & Commit Action')
    setDefault('author_email', 'actions@github.com')
  }

  info(`Using '${getInput('author_name')} <${getInput('author_email')}>' as author.`)
}

function setDefault(input: string, value: string) {
  const key = 'INPUT_' + input.toUpperCase()
  if (!process.env[key]) process.env[key] = value
}
