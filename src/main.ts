import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as path from 'path'

try {
  exec.exec(path.join(__dirname, '../src/entrypoint.sh')).catch(e => { throw e });
} catch (e) {
  core.setFailed(e)
}
