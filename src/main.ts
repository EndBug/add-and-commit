import * as core from '@actions/core'
import * as exec from '@actions/exec'

try {
  exec.exec('entrypoint.sh')
} catch (e) {
  core.setFailed(e)
}
