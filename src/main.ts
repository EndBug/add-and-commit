import * as core from '@actions/core'
import * as shell from 'shelljs'
import * as path from 'path'

try {
  checkInputs()
  shell.exec(path.join(__dirname, '../src/entrypoint.sh'))
} catch (e) {
  core.setFailed(e)
}

function checkInputs() {
  const eventPath = process.env.GITHUB_EVENT_PATH
  if (eventPath) {
    const { author } = require(eventPath).head_commit
    setDefault('author_name', author.name)
    setDefault('author_email', author.email)
  } else {
    core.warning('No event path available, unable to fetch author info.')
    setDefault('author_name', 'Add & Commit Action')
    setDefault('author_email', 'actions@github.com')
  }
  setDefault('remove', '')
  core.info(`Using '${core.getInput('author_name')} <${core.getInput('author_email')}>' as author.`)
  core.info(`Using '${process.env.INPUT_AUTHOR_NAME} <${process.env.INPUT_AUTHOR_EMAIL}>' as author.`)
}

function setDefault(input: string, value: string) {
  const key = 'INPUT_' + input.toUpperCase()
  if (!process.env[key]) process.env[key] = value
}