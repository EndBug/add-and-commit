import * as core from '@actions/core'
import * as shell from 'shelljs'

try {
  shell.exec('./entrypoint.sh')
} catch (e) {
  core.setFailed(e)
}
