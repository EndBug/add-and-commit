import * as core from '@actions/core'
import * as exec from '@actions/exec'

const cwd = process.env.GITHUB_WORKSPACE || '/github/workspace'

try {
  exec.exec('./entrypoint.sh', [], { cwd })
} catch (e) {
  core.setFailed(e)
}
