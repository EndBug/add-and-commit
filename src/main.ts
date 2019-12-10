import * as core from '@actions/core'
import * as path from 'path'
import { exec } from 'child_process';

try {
  exec('ls')
  exec(`../src/entrypoint.sh`)
} catch (e) {
  core.setFailed(e)
}
