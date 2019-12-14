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
    if (!process.env.INPUT_AUTHOR_NAME) process.env.INPUT_AUTHOR_NAME = author.name
    if (!process.env.INPUT_AUTHOR_EMAIL) process.env.INPUT_AUTHOR_EMAIL = author.email
  } else {
    core.warning('No event path available, unable to fetch author info.')
    if (!process.env.INPUT_AUTHOR_NAME) process.env.INPUT_AUTHOR_NAME = 'Add & Commit Action'
    if (!process.env.INPUT_AUTHOR_EMAIL) process.env.INPUT_AUTHOR_EMAIL = 'actions@github.com'
  }
  core.info(`Using '${process.env.INPUT_AUTHOR_NAME} <${process.env.INPUT_AUTHOR_EMAIL}>' as author.`)
}
