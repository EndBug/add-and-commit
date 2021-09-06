# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [7.3.0] - 2021-09-06

### Added:

- Added custom committer support via the `committer_name` and `committer_email` inputs (#264)
- Added `commit_sha` output (#275)
- Added `pathspec_error_handling` input (#280)

## [7.2.1] - 2021-05-11

### Fixed:

- Fixed an issue with missing outputs (#189)

## [7.2.0] - 2021-04-22

### Added:

- `default_author`: this input allows you to control how the action fills missing author name or email (issue #167)
- `github_token` input introduced to get token to use in API calls

### Fixed:

- Git args are now parsed with [`string-argv`](https://npm.im/string-argv), the format has to comply with what the package can parse (issue #179)

## [7.1.2] - 2021-04-16

### Fixed:

- Git args parsing now correctly handles quotes, that can be used for multi-word arguments (issue #166)

## [7.1.1] - 2021-04-04

### Fixed:

- Git args parsing has been improved, and now handles spaces correctly (issue #154)

## [7.1.0] - 2021-03-03

### Added:

- `pull_strategy`: you can use 'NO-PULL' to prevent the action from pulling from the remote at all.

## [7.0.0] - 2021-01-16

### Changed:

- **[BREAKING]** The token input has been removed: author info will be filled using the GitHub Actor, instead of fetching info from the GitHub API.  
  The commits will be authored using the GitHub no-reply email associated with the account: username@users.noreply.github.com
- **[BREAKING]** Because of the change above, the author will now be the user that triggered the action run, and not the author of the last commit: while the two are often the same person, there are instances where they might differ (e.g. when a workflow run is triggered manually).

## [6.2.0] - 2020-12-23

### Added:

- `push` input: allow for custom `git push` arguments to be used, more info in the README. (issue #100)

## [6.1.0] - 2020-12-22

### Added:

- `token` input: you can now use this instead of setting the `GITHUB_TOKEN` env variable, which has been deprecated. This input is optional, its default value is the default `secrets.GITHUB_TOKEN`. You only need to use this if you want the action to run with a PAT. (issue #110)

### Deprecated:

- `GITHUB_TOKEN`: the use of this env variable is now deprecated in favor of the `token` input, you'll start receiving warnings if you keep using it. (issue #110)

## [6.0.0] - 2020-12-22

### Added:

- (BREAKING?) Multiple git commands: support JSON/YAML arrays for the `add` and `remove` parameters (you still need pass a string as input, but that can be parsed to an array by the action). Using them will run multiple commands in succession. I don't think this will be really breaking anything, but I've used a major version change just to be sure. There's more info about this stuff on the README. (issue #95)

## [5.3.0] - 2020-12-12

### Added:

- Outputs: the action now has 3 outputs (`committed`, `pushed`, and `tagged`) that will be set to either `true` or `false` to tell you what the action has done. The outputs are also shown in the action logs.

## [5.2.0] - 2020-11-11

### Added:

- New `push` option: this lets you tell the action whether to push commit and tags to the repo. The default value is `true`, so that the default behavior is not changed. (issue #86)

## [5.1.2] - 2020-11-10

### Fixed:

- Fixed an issue with the build (issue #88)

## [5.1.1] - 2020-11-07

### Fixed:

- Fixed typo in parameter name: `pull_strategy` was written as `pull_stategy` (PR #83)

## [5.1.0] - 2020-10-07

### Added:

- The default commit message now displays the name of the workflow too (issue #64)

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

[unreleased]: https://github.com/EndBug/add-and-commit/compare/v7.3.0...HEAD
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
[5.1.0]: https://github.com/EndBug/add-and-commit/compare/v5.0.0...v5.1.0
[5.1.1]: https://github.com/EndBug/add-and-commit/compare/v5.1.0...v5.1.1
[5.1.2]: https://github.com/EndBug/add-and-commit/compare/v5.1.1...v5.1.2
[5.2.0]: https://github.com/EndBug/add-and-commit/compare/v5.1.2...v5.2.0
[5.3.0]: https://github.com/EndBug/add-and-commit/compare/v5.2.0...v5.3.0
[6.0.0]: https://github.com/EndBug/add-and-commit/compare/v5.3.0...v6.0.0
[6.1.0]: https://github.com/EndBug/add-and-commit/compare/v6.0.0...v6.1.0
[6.2.0]: https://github.com/EndBug/add-and-commit/compare/v6.1.0...v6.2.0
[7.0.0]: https://github.com/EndBug/add-and-commit/compare/v6.2.0...v7.0.0
[7.1.0]: https://github.com/EndBug/add-and-commit/compare/v7.0.0...v7.1.0
[7.1.1]: https://github.com/EndBug/add-and-commit/compare/v7.1.0...v7.1.1
[7.1.2]: https://github.com/EndBug/add-and-commit/compare/v7.1.1...v7.1.2
[7.2.0]: https://github.com/EndBug/add-and-commit/compare/v7.1.2...v7.2.0
[7.2.1]: https://github.com/EndBug/add-and-commit/compare/v7.2.0...v7.2.1
[7.3.0]: https://github.com/EndBug/add-and-commit/compare/v7.2.1...v7.3.0
