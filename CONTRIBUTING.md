# Contributing

If you want to contribute to this project, check out these steps!

1. Check out existing features to make sure your case is not already covered. Also, try [searching open or closed issues](https://github.com/EndBug/add-and-commit/issues) that may cover the same topic.
2. Either [open a new issue](https://github.com/EndBug/add-and-commit/issues/new/choose) or comment on an existing one to let everyone know what you're working on.
3. Edit the source files to implement your feature or fix.
4. On Node.js 24, build the action (`npm ci && npm run build`) and include any `lib/` changes in your commit. With Husky installed, the pre-commit hook rebuilds and stages `lib/` for you. CI fails if the committed `lib/` does not match a clean rebuild. Run `npm test` (unit + integration tests against the built `lib/`).
5. Update the [action manifest](./action.yml) AND the [README](./README.md) with your changes.
6. [Open a PR](https://github.com/EndBug/add-and-commit/compare).

Thanks! 💖
