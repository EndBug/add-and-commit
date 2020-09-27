# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [5.0.0] - 2020-09-27
### Changed:
- **[BREAKING]** Action parameters: multiple action parameters have been changed, refer to the docs for better info
- The code is now entirely in TypeScript (PR #57)

### Fixed:
- Improved input checks
- Logs are now displayed on Windows too
- Remove unnecessary steps
- Remove unused dependencies

## [4.4.0] - 2020-07-31
### Added:
- Pull requests: the action can now work in runs triggered by pull request events (issue #48)

## [4.3.0] - 2020-07-29
### Addded:
- `signoff` parameter: lets you use the `--signoff` argument for the `git commit` command (PR #46)

## [4.2.1] - 2020-07-10
### Fixed:
- OS-support: the action now properly works on Windows instances (issue #33)

## [4.2.0] - 2020-05-17
### Added:
- Tagging: you can now create and update lightweight tags (PR #30)

## [4.1.0] - 2020-05-01
### Added: 
- `ref` parameter: lets you choose the branch to run the action on, the default is the one that triggered the workflow (issue #29)

## [4.0.3] - 2020-05-01
### Fixed:
- Logs: `git diff` won't display logs anymore, to avoid buffer problems (issue #27)
- Logs: additional info will be logged along with the command outputs
- Logs: added groups to improve readability

## [4.0.2] - 2020-04-19
### Fixed:
- Error handling: failures are now easier to read (issue #25)

## [4.0.1] - 2020-03-20
### Fixed:
- Scheduled events: the action can be used in action runs triggered by a scheduled events
- Warnings: there won't be warnings when both `author_name` and `author_email` are set

## [4.0.0] - 2020-03-03
### Removed:
- **[BREAKING]** `path` parameter: see 'Changed' section for more info
- **[BREAKING]** `pattern` parameter: see 'Changed' section for more info

### Changed:
- The action now uses `git add` and `git rm` commands, you can choose their arguemnts directly by using the `add` and `remove` parameters
- **[BREAKING]** Error handling: the action won't stop if one of your git commands fails (e.g. if one of your pathspecs doesn't match any file)

## [3.1.0] - 2020-02-21
### Added:
- `remove` parameter: lets you delete files directly from the action

## [3.0.0] - 2020-01-24
### Added:
- The action can now run in multiple subsequent jobs in the same workflow

### Removed:
- **[BREAKING]** [`actions/checkout@v1`](https://github.com/actions/checkout/tree/v1) support is being dropped in favor of [`actions/checkout@v2`](https://github.com/actions/checkout/releases/tag/v2)

## [2.3.2] - 2019-12-29
### Added:
- `cwd` parameter: lets you set the Current Working Directory

## [2.3.1] - 2019-12-20
### Added: 
- Short tags: from now on, there will be short major tags available (`v2`, `v3`, ...)

## [2.3.0] - 2019-12-14
### Changed:
- TypeScript rewrite: the action will run faster because, unlike with Docker, no build process is needed

### Added:
- OS support: the action can now run in non-Linux environments too

## [2.2.0] - 2019-12-14
### Added:
- The action can automatically fetch the commit author to use
- You can manually provide the author using the `author_name` and `author_email` parameters

## [2.1.1] - 2019-12-07
### Fixed:
- The action can now be used multiple times in the same workflow

## [2.1.0] - 2019-09-19
### Added:
- `force` parameter: uses `--force` when running `git add`

## [2.0.0] - 2019-09-18
### Changed:
- **[BREAKING]** The action now uses a `find` command

## [1.0.0] - 2019-09-17
First release

#
[Unreleased]: https://github.com/EndBug/add-and-commit/compare/v5.0.0...HEAD
[1.0.0]: https://github.com/EndBug/add-and-commit/tree/v1.0.0
[2.0.0]: https://github.com/EndBug/add-and-commit/compare/v1.0.0...v2.0.0
[2.1.0]: https://github.com/EndBug/add-and-commit/compare/v2.0.0...v2.1.0
[2.1.1]: https://github.com/EndBug/add-and-commit/compare/v2.1.0...v2.1.1
[2.2.0]: https://github.com/EndBug/add-and-commit/compare/v2.1.1...v2.2.0
[2.3.0]: https://github.com/EndBug/add-and-commit/compare/v2.2.0...v2.3.0
[2.3.1]: https://github.com/EndBug/add-and-commit/compare/v2.3.0...v2.3.1
[2.3.2]: https://github.com/EndBug/add-and-commit/compare/v2.3.1...v2.3.2
[3.0.0]: https://github.com/EndBug/add-and-commit/compare/v2.3.2...v3.0.0
[3.1.0]: https://github.com/EndBug/add-and-commit/compare/v3.0.0...v3.1.0
[4.0.0]: https://github.com/EndBug/add-and-commit/compare/v3.1.0...v4.0.0
[4.0.1]: https://github.com/EndBug/add-and-commit/compare/v4.0.0...v4.0.1
[4.0.2]: https://github.com/EndBug/add-and-commit/compare/v4.0.1...v4.0.2
[4.0.3]: https://github.com/EndBug/add-and-commit/compare/v4.0.2...v4.0.3
[4.1.0]: https://github.com/EndBug/add-and-commit/compare/v4.0.3...v4.1.0
[4.2.0]: https://github.com/EndBug/add-and-commit/compare/v4.1.0...v4.2.0
[4.2.1]: https://github.com/EndBug/add-and-commit/compare/v4.2.0...v4.2.1
[4.3.0]: https://github.com/EndBug/add-and-commit/compare/v4.2.1...v4.3.0
[4.4.0]: https://github.com/EndBug/add-and-commit/compare/v4.3.0...v4.4.0
[5.0.0]: https://github.com/EndBug/add-and-commit/compare/v4.4.0...v5.0.0
