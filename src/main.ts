import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as path from 'path'
import { spawn } from 'child_process';

try {
  spawn('ls')
  spawn(path.join(__dirname, '../src/entrypoint.sh'))
} catch (e) {
  core.setFailed(e)
}
