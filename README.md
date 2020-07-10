# Add & Commit
<!-- ALL-CONTRIBUTORS-BADGE:START - Do not remove or modify this section -->
[![All Contributors](https://img.shields.io/badge/all_contributors-9-orange.svg?style=flat-square)](#contributors-)
<!-- ALL-CONTRIBUTORS-BADGE:END -->

You can use this GitHub Action to commit changes made in your workflow run directly to your repo: for example, you use it to lint your code, update documentation, commit updated builds, etc....

This is **heavily** inspired by [git-auto-commit-action](https://github.com/stefanzweifel/git-auto-commit-action) (by [Stefan Zweifel](https://github.com/stefanzweifel)): that action automatically detects changed files and commits them. While this is useful for most situations, this doesn't commit untracked files and can sometimes commit unintended changes (such as `package-lock.json` or similar, that may have happened during previous steps).  
This action lets you choose the path that you want to use when adding & committing changes so that it works as you would normally do using `git` on your machine.

## Usage

Add a step like this to your workflow:

```yaml
- uses: EndBug/add-and-commit@v4 # You can change this to use a specific version
  with:
    # The arguments for the `git add` command (see the paragraph below for more info)
    # Default: '.'
    add: 'src'

    # The name of the user that will be displayed as the author of the commit
    # Default: author of the commit that triggered the run
    author_name: Your Name

    # The email of the user that will be displayed as the author of the commit
    # Default: author of the commit that triggered the run
    author_email: mail@example.com

    # The local path to the directory where your repository is located. You should use actions/checkout first to set it up
    # Default: '.'
    cwd: './path/to/the/repo'

    # Whether to use the --force option on `git add`, in order to bypass eventual gitignores
    # Default: false
    force: true

    # The message for the commit
    # Default: 'Commit from GitHub Actions'
    message: 'Your commit message'

    # Name of the branch to use, if different from the one that triggered the workflow
    # Default: the branch that triggered the workflow (from GITHUB_REF)
    ref: 'someOtherBranch'

    # The arguments for the `git rm` command (see the paragraph below for more info)
    # Default: ''
    remove: "./dir/old_file.js"

    # Name of the tag to add to the new commit (see the paragraph below for more info)
    # Default: ''
    tag: "v1.0.0"

  env:
    # This is necessary in order to push a commit to the repo
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }} # Leave this line unchanged
```

### Environment variables:

The only `env` variable required is the token for the action to run: GitHub generates one automatically, but you need to pass it through `env` to make it available to actions. You can find more about `GITHUB_TOKEN` [here](https://help.github.com/en/articles/virtual-environments-for-github-actions#github_token-secret).  
That said, you can just copy the example line and not worry about it. If you do want to use a different token you can pass that in, but I wouldn't see any possible advantage in doing so.

### Adding files:

The action adds files using a regular `git add` command, so you can put every kind of argument in the `add` option. For example, if you don't want it to use a recursive behavior: `$(find . -maxdepth 1 -name *.js)`.
The script will not stop if one of the git commands fails. E.g.: if your command shows a "fatal: pathspec 'yourFile' did not match any files" error the action will go on.

### Deleting files:

You can delete files with the `remove` option: that runs a `git rm` command that will stage the files in the given path for removal. 
The script will not stop if one of the git commands fails. E.g.: if your command shows a "fatal: pathspec 'yourFile' did not match any files" error the action will go on.

### Tagging:

You can tag commits with the `tag` option: when used, it will create a lightweight tag for the commit with the name you set as input. If not entered (or if an empty string is passed) teh action won't create any tag.  
If there is already a tag with the name you entered it will be overwritten, and so the tag will be "updated".

### Examples:

Do you want to lint your JavaScript files, located in the `src` folder, with ESLint, so that fixable changes are done without your intervention? You can use a workflow like this:

```yaml
name: Lint source code
on: push

jobs: 
  run:
    name: Lint with ESLint
    runs-on: ubuntu-latest
    steps: 
    - name: Checkout repo
      uses: actions/checkout@v2

    - name: Set up Node.js
      uses: actions/setup-node@v1
      with:
        node-version: 12.x
    
    - name: Install dependencies
      run: npm install

    - name: Update source code
      run: eslint "src/**" --fix

    - name: Commit changes
      uses: EndBug/add-and-commit@v4
      with:
        author_name: Your Name
        author_email: mail@example.com
        message: "Your commit message"
        add: "*.js"
      env:
        GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

If you need to run the action on a repository that is not located in [`$GITHUB_WORKSPACE`](https://help.github.com/en/actions/automating-your-workflow-with-github-actions/using-environment-variables#default-environment-variables), you can use the `cwd` option: the action uses a `cd` normal command, so the path should follow bash standards.

```yaml
name: Use a different repository directory
on: push

jobs: 
  run:
    name: Add a text file
    runs-on: ubuntu-latest

    steps:
      # If you need to, you can check out your repo to a different location
      - uses: actions/checkout@v2
        with:
          path: "./pathToRepo/"

      # You can make whatever type of change to the repo...
      - run: echo "123" > ./pathToRepo/file.txt

      # ...and then use the action as you would normally do, but providing the path to the repo
      - uses: EndBug/add-and-commit@v4
        with:
          message: "Add the very useful text file"
          add: "*.txt"
          cwd: "./pathToRepo/"
          force: true
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## Contributors ✨

Thanks goes to these wonderful people ([emoji key](https://allcontributors.org/docs/en/emoji-key)):

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->
<table>
  <tr>
    <td align="center"><a href="https://github.com/EndBug"><img src="https://avatars1.githubusercontent.com/u/26386270?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Federico Grandi</b></sub></a><br /><a href="https://github.com/EndBug/add-and-commit/commits?author=EndBug" title="Code">💻</a> <a href="https://github.com/EndBug/add-and-commit/commits?author=EndBug" title="Documentation">📖</a></td>
    <td align="center"><a href="https://github.com/jactor-rises"><img src="https://avatars3.githubusercontent.com/u/14565088?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Tor Egil Jacobsen</b></sub></a><br /><a href="https://github.com/EndBug/add-and-commit/commits?author=jactor-rises" title="Code">💻</a></td>
    <td align="center"><a href="https://twitter.com/yelizariev"><img src="https://avatars0.githubusercontent.com/u/186131?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Ivan Yelizariev</b></sub></a><br /><a href="#ideas-yelizariev" title="Ideas, Planning, & Feedback">🤔</a></td>
    <td align="center"><a href="https://github.com/jhhughes"><img src="https://avatars2.githubusercontent.com/u/13724293?v=4?s=100" width="100px;" alt=""/><br /><sub><b>jhhughes</b></sub></a><br /><a href="https://github.com/EndBug/add-and-commit/issues?q=author%3Ajhhughes" title="Bug reports">🐛</a></td>
    <td align="center"><a href="https://sunengine.site"><img src="https://avatars3.githubusercontent.com/u/10674646?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Дмитрий Океаний</b></sub></a><br /><a href="#ideas-DmitrijOkeanij" title="Ideas, Planning, & Feedback">🤔</a></td>
    <td align="center"><a href="https://github.com/brahma-dev"><img src="https://avatars3.githubusercontent.com/u/1793295?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Brahma Dev</b></sub></a><br /><a href="https://github.com/EndBug/add-and-commit/issues?q=author%3Abrahma-dev" title="Bug reports">🐛</a></td>
    <td align="center"><a href="https://github.com/felixlapalma"><img src="https://avatars2.githubusercontent.com/u/38389683?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Felix Rojo Lapalma</b></sub></a><br /><a href="https://github.com/EndBug/add-and-commit/issues?q=author%3Afelixlapalma" title="Bug reports">🐛</a></td>
  </tr>
  <tr>
    <td align="center"><a href="http://robinwijnant.me"><img src="https://avatars3.githubusercontent.com/u/33033209?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Robin Wijnant</b></sub></a><br /><a href="https://github.com/EndBug/add-and-commit/issues?q=author%3ARobinWijnant" title="Bug reports">🐛</a> <a href="https://github.com/EndBug/add-and-commit/commits?author=RobinWijnant" title="Code">💻</a></td>
    <td align="center"><a href="https://github.com/onilton"><img src="https://avatars2.githubusercontent.com/u/725676?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Onilton Maciel</b></sub></a><br /><a href="#ideas-onilton" title="Ideas, Planning, & Feedback">🤔</a></td>
  </tr>
</table>

<!-- markdownlint-enable -->
<!-- prettier-ignore-end -->
<!-- ALL-CONTRIBUTORS-LIST:END -->

This project follows the [all-contributors](https://github.com/all-contributors/all-contributors) specification. Contributions of any kind welcome!

## License

This action is distributed under the MIT license, check the [license](LICENSE) for more info.
