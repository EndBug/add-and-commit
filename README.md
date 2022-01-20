# Add & Commit

[![Public workflows that use this action.](https://img.shields.io/endpoint?url=https%3A%2F%2Fapi-endbug.vercel.app%2Fapi%2Fgithub-actions%2Fused-by%3Faction%3DEndBug%2Fadd-and-commit%26badge%3Dtrue)](https://github.com/search?o=desc&q=EndBug+add-and-commit+path%3A.github%2Fworkflows+language%3AYAML&s=&type=Code)
[![All Contributors](https://img.shields.io/github/all-contributors/EndBug/add-and-commit)](#contributors-)

You can use this GitHub Action to commit changes made in your workflow run directly to your repo: for example, you use it to lint your code, update documentation, commit updated builds, etc....

This is **heavily** inspired by [git-auto-commit-action](https://github.com/stefanzweifel/git-auto-commit-action) (by [Stefan Zweifel](https://github.com/stefanzweifel)): that action automatically detects changed files and commits them. While this is useful for most situations, this doesn't commit untracked files and can sometimes commit unintended changes (such as `package-lock.json` or similar, that may have happened during previous steps).  
This action lets you choose the path that you want to use when adding & committing changes so that it works as you would normally do using `git` on your machine.

## Inputs

Add a step like this to your workflow:

```yaml
- uses: EndBug/add-and-commit@v7 # You can change this to use a specific version.
  with:
    # The arguments for the `git add` command (see the paragraph below for more info)
    # Default: '.'
    add: 'src'

    # The name of the user that will be displayed as the author of the commit.
    # Default: depends on the default_author input
    author_name: Author Name

    # The email of the user that will be displayed as the author of the commit.
    # Default: depends on the default_author input
    author_email: mail@example.com

    # The name of the custom committer you want to use, if different from the author of the commit.
    # Default: the name of the author (set with either author_name or default_author)
    committer_name: Committer Name

    # The email of the custom committer you want to use, if different from the author of the commit.
    # Default: the email of the author (set with either author_email or default_author)
    committer_email: mail@example.com

    # The local path to the directory where your repository is located. You should use actions/checkout first to set it up.
    # Default: '.'
    cwd: './path/to/the/repo'

    # Determines the way the action fills missing author name and email. Three options are available:
    # - github_actor -> UserName <UserName@users.noreply.github.com>
    # - user_info -> Your Display Name <your-actual@email.com>
    # - github_actions -> github-actions <email associated with the github logo>
    # Default: github_actor
    default_author: github_actor

    # The message for the commit.
    # Default: 'Commit from GitHub Actions (name of the workflow)'
    message: 'Your commit message'

    # If this input is set, the action will push the commit to a new branch with this name.
    # Default: ''
    new_branch: custom-new-branch

    # The way the action should handle pathspec errors from the add and remove commands. Three options are available:
    # - ignore -> errors will be logged but the step won't fail
    # - exitImmediately -> the action will stop right away, and the step will fail
    # - exitAtEnd -> the action will go on, every pathspec error will be logged at the end, the step will fail.
    # Default: ignore
    pathspec_error_handling: ignore

    # Arguments for the git pull command. Use NO-PULL to avoid the action pulling at all.
    # Default: '--no-rebase'
    pull: 'NO-PULL or --rebase --autostash ...'

    # Whether to push the commit and, if any, its tags to the repo. It can also be used to set the git push arguments (see the paragraph below for more info)
    # Default: true
    push: false

    # The arguments for the `git rm` command (see the paragraph below for more info)
    # Default: ''
    remove: './dir/old_file.js'

    # Arguments for the git tag command (the tag name always needs to be the first word not preceded by an hyphen)
    # Default: ''
    tag: 'v1.0.0 --force'
```

### Git arguments

Multiple options let you provide the git arguments that you want the action to use. It's important to note that these arguments **are not actually used with a CLI command**, but they are parsed by a package called [`string-argv`](https://npm.im/string-argv), and then used with [`simple-git`](https://npm.im/simple-git).  
What does this mean for you? It means that string that contain a lot of nested quotes may be parsed incorrectly, and that specific ways of declaring arguments may not be supported by this libraries. If you're having issues with your argument strings you can check whether they're being parsed correctly either by [enabling debug logging](https://docs.github.com/en/actions/managing-workflow-runs/enabling-debug-logging) for your workflow runs or by testing it directly with `string-argv` ([RunKit demo](https://npm.runkit.com/string-argv)): if each argument and option is aprsed correctly you'll see an array where every string is an option or value.

### Adding files

The action adds files using a regular `git add` command, so you can put every kind of argument in the `add` option. For example, if you want to force-add a file: `./path/to/file.txt --force`.  
The script will not stop if one of the git commands doesn't match any file. E.g.: if your command shows a "fatal: pathspec 'yourFile' did not match any files" error the action will go on.  
You can also use JSON or YAML arrays (e.g. `'["first", "second"]'`, `"['first', 'second']"`) to make the action run multiple `git add` commands: the action will log how your input has been parsed. Please mind that your input still needs to be a string because of how GitHub Actions works with inputs: just write your array inside the string, the action will parse it later.

### Deleting files

You can delete files with the `remove` option: that runs a `git rm` command that will stage the files in the given path for removal. As with the `add` argument, you can use every option `git rm` allows (e.g. add `--force` to ignore `.gitignore` rules).  
The script will not stop if one of the git commands doesn't match any file. E.g.: if your command shows a "fatal: pathspec 'yourFile' did not match any files" error the action will go on.  
You can also use JSON or YAML arrays (e.g. `'["first", "second"]'`, `"['first', 'second']"`) to make the action run multiple `git rm` commands: the action will log how your input has been parsed. Please mind that your input still needs to be a string because of how GitHub Actions works with inputs: just write your array inside the string, the action will parse it later.

### Pushing

By default the action runs the following command: `git push origin ${new_branch input} --set-upstream`. You can use the `push` input to modify this behavior, here's what you can set it to:

- `true`: this is the default value, it will behave as usual.
- `false`: this prevents the action from pushing at all, no `git push` command is run.
- any other string:  
  The action will use your string as the arguments for the `git push` command. Please note that nothing is used other than your arguments, and the command will result in `git push ${push input}` (no remote, no branch, no `--set-upstream`, you have to include them yourself).

One way to use this is if you want to force push to a branch of your repo: you'll need to set the `push` input to, for example, `origin yourBranch --force`.

### Creating a new branch

If you want the action to commit in a new branch, you can use the `new_branch` input.

Please note that if the branch exists, the action will still try push to it, but it's possible that the push will be rejected by the remote as non-straightforward.

If that's the case, you need to make sure that the branch you want to commit to is already checked out before you run the action.  
If you're **really** sure that you want to commit to that branch, you can also force-push by setting the `push` input to something like `origin yourBranchName --set-upstream --force`.

If you want to commit files "across different branches", here are two ways to do it:

1. You can check them out in two different directories, generate your files, move them to your destination and then run `add-and-commit` in the destination directory using the `cwd` input.
2. You can manually commit those files with `git` commands as you would on your machine. There are several ways to do this depending on the scenario. One of them if to stash your changes, checkout the destination branch, and popping the stash. You can then use the `add-and-commit` action as usual. Please note that this is just an example and may not work for you, since your use case may be different.

### Tagging

You can use the `tag` option to enter the arguments for a `git add` command. In order for the action to isolate the tag name from the rest of the arguments, it should be the first word not preceded by an hyphen (e.g. `-a tag-name -m "some other stuff"` is ok).

### Tokens

When pushing, the action uses the token that the local git repository has been configured with: that means that if you want to change it you'll need to do it in the steps that run before this action. For example: if you set up your repo with [`actions/checkout`](https://github.com/actions/checkout/) then you have to add the token there.  
Changing the token with which the repo is configured can be useful if you want to run CI checks on the commit pushed by this action; anyway, it has to be set up outside of this action.

The action automatically gets the GitHub token from a `github_token` input: this input should not be modified by the user, since it doesn't affect the commits as it's only used to access the GitHub API to get user info, in case they selected that option for the commit author.

### The commit from the action is not triggering CI!

That's because you're checking out the repo using the built-in [`GITHUB_TOKEN` secret](https://docs.github.com/en/actions/security-guides/automatic-token-authentication): GitHub sees that the push event has been triggered by a commit generated by CI, and doesn't run any further checks to avoid unintentional check loops.

**If you're sure** that you want the commits generated during CI to trigger other workflow runs, you can checkout the repo using a [Personal Access Token (PAT)](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token): this will make the resulting commit the same as if you made it yourself.  
If you're using `actions/checkout`, check out their [docs](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token) to see how to set your repo token.

### About `actions/checkout`

The token you use when setting up the repo with this action will determine what token `add-and-commit` will use.  
Some users reported that they were getting an error:

```
> fatal: could not read Username for 'https://github.com': No such device or address
```

If you're getting this error and you're using `actions/checkout@v1`, try upgrading to `actions/checkout@v2`. If you're still having problems after upgrading, feel free to open an issue. Issue ref: [#146](https://github.com/EndBug/add-and-commit/issues/146)

## Outputs

The action provides these outputs:

- `committed`: whether the action has created a commit (`'true'` or `'false'`)
- `commit_sha`: the short 7-digit sha of the commit that has just been created
- `pushed`: whether the action has pushed to the remote (`'true'` or `'false'`)
- `tagged`: whether the action has created a tag (`'true'` or `'false'`)

For more info on how to use outputs, see ["Context and expression syntax"](https://docs.github.com/en/free-pro-team@latest/actions/reference/context-and-expression-syntax-for-github-actions).

## Examples

If you don't want to use your GitHub username for the CI commits, you can use the `default_author` option to make it appear as if it was made by "github-actions"

<img src="https://user-images.githubusercontent.com/26386270/115738624-80b51780-a38d-11eb-9bbe-77461654274c.png" height=40/>

```yaml
on: push
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: EndBug/add-and-commit@v7
        with:
          default_author: github_actions
```

You can also use the `committer_name` and `committer_email` inputs to make it appear as if GitHub Actions is the committer, here are a couple of example steps:

<img src="https://user-images.githubusercontent.com/26386270/130594168-1d910710-e2d0-4b06-9324-cbe5dde59154.png" height=70/>

```yaml
- uses: EndBug/add-and-commit@v7
  with:
    message: Show GitHub Actions logo
    committer_name: GitHub Actions
    committer_email: actions@github.com
```

<img src="https://user-images.githubusercontent.com/26386270/130594443-b881fae7-3064-4020-a4cc-6db37ef0df65.png" height=70/>

```yaml
- uses: EndBug/add-and-commit@v7
  with:
    message: Show GitHub logo
    committer_name: GitHub Actions
    committer_email: 41898282+github-actions[bot]@users.noreply.github.com
```

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
        uses: EndBug/add-and-commit@v7
        with:
          author_name: Your Name
          author_email: mail@example.com
          message: 'Your commit message'
          add: '*.js'
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
          path: './pathToRepo/'

      # You can make whatever type of change to the repo...
      - run: echo "123" > ./pathToRepo/file.txt

      # ...and then use the action as you would normally do, but providing the path to the repo
      - uses: EndBug/add-and-commit@v7
        with:
          message: 'Add the very useful text file'
          add: '*.txt --force'
          cwd: './pathToRepo/'
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
    <td align="center"><a href="https://github.com/jsoref"><img src="https://avatars0.githubusercontent.com/u/2119212?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Josh Soref</b></sub></a><br /><a href="https://github.com/EndBug/add-and-commit/commits?author=jsoref" title="Documentation">📖</a></td>
    <td align="center"><a href="https://github.com/ToMe25"><img src="https://avatars1.githubusercontent.com/u/38815969?v=4?s=100" width="100px;" alt=""/><br /><sub><b>ToMe25</b></sub></a><br /><a href="https://github.com/EndBug/add-and-commit/commits?author=ToMe25" title="Code">💻</a> <a href="#ideas-ToMe25" title="Ideas, Planning, & Feedback">🤔</a></td>
    <td align="center"><a href="https://github.com/JonasJacobsUserspace"><img src="https://avatars0.githubusercontent.com/u/59708720?v=4?s=100" width="100px;" alt=""/><br /><sub><b>JonasJacobsUserspace</b></sub></a><br /><a href="https://github.com/EndBug/add-and-commit/issues?q=author%3AJonasJacobsUserspace" title="Bug reports">🐛</a></td>
    <td align="center"><a href="https://github.com/pvogt09"><img src="https://avatars3.githubusercontent.com/u/50047961?v=4?s=100" width="100px;" alt=""/><br /><sub><b>pvogt09</b></sub></a><br /><a href="https://github.com/EndBug/add-and-commit/commits?author=pvogt09" title="Code">💻</a></td>
    <td align="center"><a href="http://hoten.cc"><img src="https://avatars1.githubusercontent.com/u/4071474?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Connor Clark</b></sub></a><br /><a href="#ideas-connorjclark" title="Ideas, Planning, & Feedback">🤔</a></td>
  </tr>
  <tr>
    <td align="center"><a href="https://github.com/Cyberbeni"><img src="https://avatars1.githubusercontent.com/u/8356175?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Benedek Kozma</b></sub></a><br /><a href="#ideas-Cyberbeni" title="Ideas, Planning, & Feedback">🤔</a> <a href="https://github.com/EndBug/add-and-commit/commits?author=Cyberbeni" title="Code">💻</a></td>
    <td align="center"><a href="https://github.com/coffeegoddd"><img src="https://avatars3.githubusercontent.com/u/43383835?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Dustin Brown</b></sub></a><br /><a href="https://github.com/EndBug/add-and-commit/issues?q=author%3Acoffeegoddd" title="Bug reports">🐛</a></td>
    <td align="center"><a href="https://github.com/Chocrates"><img src="https://avatars1.githubusercontent.com/u/1758164?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Chris McIntosh</b></sub></a><br /><a href="https://github.com/EndBug/add-and-commit/issues?q=author%3AChocrates" title="Bug reports">🐛</a></td>
    <td align="center"><a href="https://github.com/kbsali"><img src="https://avatars0.githubusercontent.com/u/53676?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Kevin Saliou</b></sub></a><br /><a href="#ideas-kbsali" title="Ideas, Planning, & Feedback">🤔</a></td>
    <td align="center"><a href="https://github.com/ewjoachim"><img src="https://avatars0.githubusercontent.com/u/1457576?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Joachim Jablon</b></sub></a><br /><a href="#ideas-ewjoachim" title="Ideas, Planning, & Feedback">🤔</a></td>
    <td align="center"><a href="https://github.com/trallnag"><img src="https://avatars3.githubusercontent.com/u/24834206?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Tim Schwenke</b></sub></a><br /><a href="#ideas-trallnag" title="Ideas, Planning, & Feedback">🤔</a></td>
    <td align="center"><a href="https://www.somethingcatchy.net"><img src="https://avatars1.githubusercontent.com/u/12880806?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Possible Triangle</b></sub></a><br /><a href="#ideas-PssbleTrngle" title="Ideas, Planning, & Feedback">🤔</a></td>
  </tr>
  <tr>
    <td align="center"><a href="https://dominikschilling.de"><img src="https://avatars2.githubusercontent.com/u/617637?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Dominik Schilling</b></sub></a><br /><a href="#ideas-ocean90" title="Ideas, Planning, & Feedback">🤔</a> <a href="https://github.com/EndBug/add-and-commit/commits?author=ocean90" title="Documentation">📖</a> <a href="https://github.com/EndBug/add-and-commit/commits?author=ocean90" title="Code">💻</a></td>
    <td align="center"><a href="https://chaos.social/@rugk"><img src="https://avatars.githubusercontent.com/u/11966684?v=4?s=100" width="100px;" alt=""/><br /><sub><b>rugk</b></sub></a><br /><a href="https://github.com/EndBug/add-and-commit/commits?author=rugk" title="Documentation">📖</a></td>
    <td align="center"><a href="https://xenoterracide.com"><img src="https://avatars.githubusercontent.com/u/5517?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Caleb Cushing</b></sub></a><br /><a href="https://github.com/EndBug/add-and-commit/issues?q=author%3Axenoterracide" title="Bug reports">🐛</a></td>
    <td align="center"><a href="https://ruohola.dev"><img src="https://avatars.githubusercontent.com/u/33625218?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Eero Ruohola</b></sub></a><br /><a href="https://github.com/EndBug/add-and-commit/issues?q=author%3Aruohola" title="Bug reports">🐛</a> <a href="#ideas-ruohola" title="Ideas, Planning, & Feedback">🤔</a></td>
    <td align="center"><a href="https://github.com/vincentchu12"><img src="https://avatars.githubusercontent.com/u/23532586?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Vincent Chu</b></sub></a><br /><a href="https://github.com/EndBug/add-and-commit/issues?q=author%3Avincentchu12" title="Bug reports">🐛</a></td>
    <td align="center"><a href="https://www.linkedin.com/in/cwsites"><img src="https://avatars.githubusercontent.com/u/1242102?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Matt H</b></sub></a><br /><a href="https://github.com/EndBug/add-and-commit/commits?author=CWSites" title="Documentation">📖</a> <a href="#ideas-CWSites" title="Ideas, Planning, & Feedback">🤔</a></td>
    <td align="center"><a href="https://github.com/danielwerg"><img src="https://avatars.githubusercontent.com/u/35052399?v=4?s=100" width="100px;" alt=""/><br /><sub><b>danielwerg</b></sub></a><br /><a href="https://github.com/EndBug/add-and-commit/commits?author=danielwerg" title="Documentation">📖</a></td>
  </tr>
  <tr>
    <td align="center"><a href="https://orcid.org/0000-0001-6962-4290"><img src="https://avatars.githubusercontent.com/u/1366654?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Oliver Kopp</b></sub></a><br /><a href="#ideas-koppor" title="Ideas, Planning, & Feedback">🤔</a></td>
    <td align="center"><a href="https://github.com/Glidias"><img src="https://avatars.githubusercontent.com/u/190195?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Glenn Ko</b></sub></a><br /><a href="#ideas-Glidias" title="Ideas, Planning, & Feedback">🤔</a></td>
    <td align="center"><a href="http://blog.madewithdrew.com/"><img src="https://avatars.githubusercontent.com/u/239123?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Drew Wells</b></sub></a><br /><a href="#ideas-drewwells" title="Ideas, Planning, & Feedback">🤔</a></td>
    <td align="center"><a href="https://kotlin.desarrollador-android.com/"><img src="https://avatars.githubusercontent.com/u/7463564?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Javier Segovia Córdoba</b></sub></a><br /><a href="#ideas-JavierSegoviaCordoba" title="Ideas, Planning, & Feedback">🤔</a></td>
  </tr>
</table>

<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->

<!-- ALL-CONTRIBUTORS-LIST:END -->

This project follows the [all-contributors](https://github.com/all-contributors/all-contributors) specification. Contributions of any kind welcome!

## License

This action is distributed under the MIT license, check the [license](LICENSE) for more info.
