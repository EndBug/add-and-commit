import * as core from '@actions/core'
import * as shell from 'shelljs'
import * as path from 'path'

try {
  shell.exec(path.join(__dirname, '../src/entrypoint.sh'))
} catch (e) {
  core.setFailed(e)
}
