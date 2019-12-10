import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as path from 'path'

try {
  exec.exec('ls')
  exec.exec(`${__dirname}/../entrypoint.sh`).catch(core.setFailed);
} catch (e) {
  core.setFailed(e)
}
