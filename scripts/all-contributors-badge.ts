import * as fs from 'fs'
import { resolve } from 'path'

function path(...segments: string[]) {
  return resolve(__dirname, '..', ...segments)
}

const README = fs.readFileSync(path('README.md'), { encoding: 'utf8' }),
  { contributors } = JSON.parse(
    fs.readFileSync(path('.all-contributorsrc'), { encoding: 'utf8' })
  )
if (!(contributors instanceof Array)) throw new Error('Invalid config file')

const updatedREADME = README.split('\n')
  .map((line) =>
    line.startsWith(
      '[![All Contributors](https://img.shields.io/badge/all_contributors-'
    )
      ? `[![All Contributors](https://img.shields.io/badge/all_contributors-${contributors.length}-orange.svg?style=flat)](#contributors-)`
      : line
  )
  .join('\n')

fs.writeFileSync(path('README.md'), updatedREADME)
