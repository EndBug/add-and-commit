import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as path from 'path'
import { spawn, execFileSync } from 'child_process';

try {
  execFileSync(path.join(__dirname, '../src/entrypoint.sh'))
} catch (e) {
  core.setFailed(e)
}
