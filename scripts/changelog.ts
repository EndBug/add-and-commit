import fs from 'fs'
import path from 'path'

const currentVersion = require('../package.json').version
if (!currentVersion) throw new Error("Cant't detect library version.")

const changelogPath = path.resolve(__dirname, '../CHANGELOG.md')
const changelog = fs.readFileSync(changelogPath, { encoding: 'utf-8' })
if (changelog.includes(`## [${currentVersion}]`))
  throw new Error('Current version has already been documented.')
let futureChangelog = ''

// Add version section
let arr = changelog.split('## [Unreleased]')
arr[1] =
  `

## [${currentVersion}] - ${new Date().toISOString().slice(0, 10)}
### Removed:
- **[BREAKING]** ListName: description

### Added:
- 

### Fixed:
- ` + arr[1]
futureChangelog = arr.join('## [Unreleased]')

// Update footer
arr = futureChangelog
  .split('\n')
  .map((line) =>
    line.startsWith('[Unreleased]')
      ? `[Unreleased]: https://github.com/EndBug/add-and-commit/compare/v${currentVersion}...HEAD`
      : line
  )

const lastVersion = ([...arr].reverse()[1]?.match(/\[([^\][]*)]/) ||
  [])[0].replace(/[\[\]']+/g, '') // eslint-disable-line no-useless-escape
if (!lastVersion) throw new Error("Can't find last version in changelog.")

const lastLine = `[${currentVersion}]: https://github.com/EndBug/add-and-commit/compare/v${lastVersion}...v${currentVersion}`
if (arr[arr.length - 1] === '') arr[arr.length - 1] = lastLine
else arr.push(lastLine)
futureChangelog = arr.join('\n')

fs.writeFileSync(changelogPath, futureChangelog)
