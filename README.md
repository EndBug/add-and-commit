# Add & Commit

You can use this GitHub Action to commit changes made in your workflow run directly to your repo: for example, you use it to lint your code, update documentation, commit updated builds and so on...

This is **heavily** inspired by [git-auto-commit-action](https://github.com/stefanzweifel/git-auto-commit-action) (by [Stefan Zweifel](https://github.com/stefanzweifel)): that action automatically detects changed files and commits them. While this is useful for most situations, this doesn't commit untracked files and can sometimes commit unintended changes (such as `package-lock.json` or similar, that may have happened during previous steps).  
This action lets you choose the path that you want to use when adding & committing changes, so that it works as you would normally do using `git` on your machine.

## Usage

Add a step like this to your workflow:

```yaml
- uses: EndBug/add-and-commit@v4 # You can change this to use a specific version
  with:
    # The arguments for the git add command (see the paragraph below for more info)
    # Default: '.'
    add: 'src'

    # The name of the user that will be displayed as the author of the commit
    # Default: author of the commit that triggered the run
    author_name: Your Name

    # The The email of the user that will be displayed as the author of the commit
    # Default: author of the commit that triggered the run
    author_email: mail@example.com

    # The local path to the directory where your repository is located. You should use actions/checkout first to set it up
    # Default: '.'
    cwd: './path/to/the/repo'

    # Whether to use the --force option on git add, in order to bypass eventual gitignores
    # Default: false
    force: true

    # The message for the commit
    # Default: 'Commit from GitHub Actions'
    message: 'Your commit message'

    #  The arguments for the git rm command (see the paragraph below for more info)
    # Default: ''
    remove: "./dir/old_file.js"

  env:
    # This is necessary in order to push a commit to the repo
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }} # Leave this line unchanged
```

### Environment variables:

The only `env` variable required is the token for the action to run: GitHub generates one automatically, but you need to pass it through `env` to make it available to actions. You can find more about `GITHUB_TOKEN` [here](https://help.github.com/en/articles/virtual-environments-for-github-actions#github_token-secret).  
With that said, you can just copy the example line and don't worry about it. If you do want to use a different token you can pass that in, but I wouldn't see any possible advantage in doing so.

### Adding files:

The action adds files using a regular `git add` command, so you can put every kind of argument in the `add` option. For example, if you don't want it to use a recursive behavior: `$(find . -maxdepth 1 -name *.js)`.
The script will not stop if one the git commands fails. E.g.: if your command shows a "fatal: pathspec 'yourFile' did not match any files" error the action will go on.

### Deleting files:

You can delete files with the `remove` option: that runs a `git rm` command that will stage the files in the given path for removal. 
The script will not stop if one the git commands fails. E.g.: if your command shows a "fatal: pathspec 'yourFile' did not match any files" error the action will go on.

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
      # If you need to, you can checkout your repo to a different location
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

## License

This action is distributed under the MIT license, check the [license](LICENSE) for more info.
