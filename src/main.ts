import * as core from '@actions/core';
import * as path from 'path';
import simpleGit, {Response} from 'simple-git';
import {checkInputs, getInput, logOutputs, setOutput} from './io';
import {
  assertNoUnexpectedGitlinks,
  findUnexpectedGitlinks,
  log,
  matchGitArgs,
  neutralizeLogString,
  parseInputArray,
  pickGitIdentityConfig,
} from './util';

const baseDir = path.join(process.cwd(), getInput('cwd') || '');
const git = simpleGit({baseDir});

const exitErrors: Error[] = [];

core.info(`Running in ${baseDir}`);
(async () => {
  await checkInputs();

  const dryRun = getInput('dry_run', true);

  core.startGroup('Internal logs');
  core.info(dryRun ? '> Staging files (dry run)...' : '> Staging files...');

  const ignoreErrors =
    getInput('pathspec_error_handling') === 'ignore' ? 'pathspec' : 'none';

  let wouldStageChanges = false;

  if (getInput('add')) {
    core.info(dryRun ? '> Adding files (dry run)...' : '> Adding files...');
    const addResults = await add(ignoreErrors, dryRun);
    if (dryRun)
      wouldStageChanges =
        wouldStageChanges ||
        addResults.some(r => typeof r === 'string' && r.trim().length > 0);
  } else core.info('> No files to add.');

  if (getInput('remove')) {
    core.info(dryRun ? '> Removing files (dry run)...' : '> Removing files...');
    const removeResults = await remove(ignoreErrors, dryRun);
    if (dryRun)
      wouldStageChanges =
        wouldStageChanges ||
        removeResults.some(r => {
          if (r === null || r === undefined) return false;
          const text = typeof r === 'string' ? r : String(r);
          return text.trim().length > 0;
        });
  } else core.info('> No files to remove.');

  core.info('> Checking for uncommitted changes in the git working tree...');
  const changedFiles = (await git.diffSummary(['--cached'])).files.length;
  const allowEmpty = matchGitArgs(getInput('commit') || '').includes(
    '--allow-empty',
  );
  // continue if there are any changes or if the allow-empty commit argument is included
  if (changedFiles > 0 || wouldStageChanges || allowEmpty) {
    core.info(
      dryRun
        ? `> Dry run: would proceed (${changedFiles} already staged` +
            `${wouldStageChanges ? ', staging probes reported changes' : ''}` +
            `${allowEmpty ? ', --allow-empty' : ''}).`
        : `> Found ${changedFiles} changed files.`,
    );
    core.debug(`--allow-empty argument detected: ${allowEmpty}`);

    if (dryRun) {
      await logDryRunRemainingSteps();
      core.endGroup();
      core.info('> Dry run completed. No changes were made.');
      return;
    }

    await git
      .addConfig('user.email', getInput('author_email'), undefined, log)
      .addConfig('user.name', getInput('author_name'), undefined, log)
      .addConfig('author.email', getInput('author_email'), undefined, log)
      .addConfig('author.name', getInput('author_name'), undefined, log)
      .addConfig('committer.email', getInput('committer_email'), undefined, log)
      .addConfig('committer.name', getInput('committer_name'), undefined, log);
    if (core.isDebug()) {
      const identity = pickGitIdentityConfig((await git.listConfig()).all);
      core.debug(
        Object.keys(identity).length
          ? '> Current git identity config\n' +
              JSON.stringify(identity, null, 2)
          : '> Git identity config set (no identity keys present in listConfig)',
      );
    }

    let fetchOption: string | boolean;
    try {
      fetchOption = getInput('fetch', true);
    } catch {
      fetchOption = getInput('fetch');
    }
    if (fetchOption) {
      core.info('> Fetching repo...');
      await git.fetch(
        matchGitArgs(fetchOption === true ? '' : fetchOption),
        log,
      );
    } else core.info('> Not fetching repo.');

    const targetBranch = getInput('new_branch');
    if (targetBranch) {
      core.info('> Checking-out branch...');

      if (!fetchOption)
        core.warning(
          'Creating a new branch without fetching the repo first could result in an error when pushing to GitHub. Refer to the action README for more info about this topic.',
        );

      await git
        .checkout([targetBranch])
        .then(() => {
          log(undefined, `'${targetBranch}' branch already existed.`);
        })
        .catch(() => {
          log(undefined, `Creating '${targetBranch}' branch.`);
          return git.checkout(['-b', targetBranch], log);
        });
    }

    const pullOption = getInput('pull');
    if (pullOption) {
      core.info('> Pulling from remote...');
      core.debug(`Current git pull arguments: ${pullOption}`);
      await git
        .fetch(undefined, log)
        .pull(undefined, undefined, matchGitArgs(pullOption), log);

      core.info('> Checking for conflicts...');
      const status = await git.status(undefined, log);

      if (!status.conflicted.length) {
        core.info('> No conflicts found.');
        core.info('> Re-staging files...');
        if (getInput('add')) await add(ignoreErrors);
        if (getInput('remove')) await remove(ignoreErrors);
      } else
        throw new Error(
          `There are ${
            status.conflicted.length
          } conflicting files: ${status.conflicted
            .map(neutralizeLogString)
            .join(', ')}`,
        );
    } else core.info('> Not pulling from repo.');

    core.info('> Creating commit...');
    const data = await git.commit(
      getInput('message'),
      matchGitArgs(getInput('commit') || ''),
    );
    log(undefined, data);
    // simple-git can resolve with an empty SHA when no commit was created
    // (e.g. nothing left to commit). Do not report a false success.
    if (!data.commit) {
      throw new Error(
        'Commit did not produce a SHA; refusing to report committed=true.',
      );
    }
    setOutput('committed', 'true');
    setOutput('commit_long_sha', data.commit);
    setOutput('commit_sha', data.commit.substring(0, 7));

    if (getInput('tag')) {
      core.info('> Tagging commit...');

      if (!fetchOption)
        core.warning(
          'Creating a tag without fetching the repo first could result in an error when pushing to GitHub. Refer to the action README for more info about this topic.',
        );

      await git
        .tag(matchGitArgs(getInput('tag') || ''), (err, data?) => {
          if (data) setOutput('tagged', 'true');
          return log(err, data);
        })
        .then(data => {
          setOutput('tagged', 'true');
          return log(null, data);
        })
        .catch(err => core.setFailed(err));
    } else core.info('> No tag info provided.');

    let pushOption: string | boolean;
    try {
      pushOption = getInput('push', true);
    } catch {
      pushOption = getInput('push');
    }
    if (pushOption) {
      // If the options is `true | string`...
      core.info('> Pushing commit to repo...');

      if (pushOption === true) {
        const branch = getInput('new_branch');
        if (branch) {
          core.debug(`Running: git push --set-upstream origin -- ${branch}`);
          await git.raw(
            ['push', '--set-upstream', 'origin', '--', branch],
            (err, data?) => {
              if (data) setOutput('pushed', 'true');
              return log(err, data);
            },
          );
        } else {
          core.debug('Running: git push origin --set-upstream');
          await git.push(
            'origin',
            undefined,
            {'--set-upstream': null},
            (err, data?) => {
              if (data) setOutput('pushed', 'true');
              return log(err, data);
            },
          );
        }
      } else {
        core.debug(`Running: git push ${pushOption}`);
        await git.push(
          undefined,
          undefined,
          matchGitArgs(pushOption),
          (err, data?) => {
            if (data) setOutput('pushed', 'true');
            return log(err, data);
          },
        );
      }

      if (getInput('tag')) {
        core.info('> Pushing tags to repo...');

        await git
          .pushTags('origin', matchGitArgs(getInput('tag_push') || ''))
          .then(data => {
            setOutput('tag_pushed', 'true');
            return log(null, data);
          })
          .catch(err => core.setFailed(err));
      } else core.info('> No tags to push.');
    } else core.info('> Not pushing anything.');

    core.endGroup();
    core.info('> Task completed.');
  } else {
    core.endGroup();
    core.info(
      dryRun
        ? '> Dry run: working tree clean. Nothing would be committed.'
        : '> Working tree clean. Nothing to commit.',
    );
  }
})()
  .then(() => {
    // Check for exit errors
    if (exitErrors.length === 1) throw exitErrors[0];
    else if (exitErrors.length > 1) {
      exitErrors.forEach(e => core.error(e));
      throw 'There have been multiple runtime errors.';
    }
  })
  .then(logOutputs)
  .catch(e => {
    core.endGroup();
    logOutputs();
    core.setFailed(e);
  });

async function logDryRunRemainingSteps() {
  core.info(
    `> Would set git identity: ${getInput('author_name')} <${getInput(
      'author_email',
    )}> (committer: ${getInput('committer_name')} <${getInput(
      'committer_email',
    )}>)`,
  );

  let fetchOption: string | boolean;
  try {
    fetchOption = getInput('fetch', true);
  } catch {
    fetchOption = getInput('fetch');
  }
  if (fetchOption) {
    core.info(
      `> Would fetch repo${
        fetchOption === true ? '' : ` with: ${fetchOption}`
      }.`,
    );
  } else core.info('> Would not fetch repo.');

  const targetBranch = getInput('new_branch');
  if (targetBranch) {
    core.info(`> Would check out branch '${targetBranch}'.`);
    if (!fetchOption)
      core.warning(
        'Creating a new branch without fetching the repo first could result in an error when pushing to GitHub. Refer to the action README for more info about this topic.',
      );
  }

  const pullOption = getInput('pull');
  if (pullOption) core.info(`> Would pull from remote with: ${pullOption}.`);
  else core.info('> Would not pull from repo.');

  core.info(
    `> Would create commit with message: "${getInput('message')}"${
      getInput('commit') ? ` (extra args: ${getInput('commit')})` : ''
    }.`,
  );

  if (getInput('tag')) {
    core.info(`> Would tag commit with: ${getInput('tag')}.`);
    if (!fetchOption)
      core.warning(
        'Creating a tag without fetching the repo first could result in an error when pushing to GitHub. Refer to the action README for more info about this topic.',
      );
  } else core.info('> No tag info provided.');

  let pushOption: string | boolean;
  try {
    pushOption = getInput('push', true);
  } catch {
    pushOption = getInput('push');
  }
  if (pushOption) {
    if (pushOption === true) {
      const branch = getInput('new_branch');
      core.info(
        branch
          ? `> Would push commit to repo (set upstream for '${branch}').`
          : '> Would push commit to repo.',
      );
    } else core.info(`> Would push commit to repo with: ${pushOption}.`);

    if (getInput('tag')) {
      core.info(
        `> Would push tags to repo${
          getInput('tag_push') ? ` with: ${getInput('tag_push')}` : ''
        }.`,
      );
    } else core.info('> No tags to push.');
  } else core.info('> Would not push anything.');
}

async function add(
  ignoreErrors: 'all' | 'pathspec' | 'none' = 'none',
  dryRun = false,
) {
  const input = getInput('add');
  if (!input) return [];

  const parsed = parseInputArray(input);
  const res: (string | void)[] = [];

  for (const args of parsed) {
    const gitArgs = dryRun
      ? ['--dry-run', ...matchGitArgs(args)]
      : matchGitArgs(args);
    res.push(
      // Push the result of every git command (which are executed in order) to the array
      // If any of them fails, the whole function will return a Promise rejection
      await git
        .add(gitArgs, (err, data) =>
          log(ignoreErrors === 'all' ? null : err, data),
        )
        .catch((e: Error) => {
          // if I should ignore every error, return
          if (ignoreErrors === 'all') return;

          // if it's a pathspec error...
          if (
            e.message.includes('fatal: pathspec') &&
            e.message.includes('did not match any files')
          ) {
            if (ignoreErrors === 'pathspec') return;

            const peh = getInput('pathspec_error_handling'),
              err = new Error(
                `Add command did not match any file: git add ${args}`,
              );
            if (peh === 'exitImmediately') throw err;
            if (peh === 'exitAtEnd') exitErrors.push(err);
          } else throw e;
        }),
    );
  }

  if (!dryRun) {
    const cachedRaw = await git.raw(['diff', '--cached', '--raw']);
    assertNoUnexpectedGitlinks(findUnexpectedGitlinks(cachedRaw));
  }

  return res;
}

async function remove(
  ignoreErrors: 'all' | 'pathspec' | 'none' = 'none',
  dryRun = false,
): Promise<(void | Response<void> | string)[]> {
  const input = getInput('remove');
  if (!input) return [];

  const parsed = parseInputArray(input);
  const res: (void | Response<void> | string)[] = [];

  for (const args of parsed) {
    const gitArgs = dryRun
      ? ['--dry-run', ...matchGitArgs(args)]
      : matchGitArgs(args);
    res.push(
      // Push the result of every git command (which are executed in order) to the array
      // If any of them fails, the whole function will return a Promise rejection
      await git
        .rm(gitArgs, (e, d) => log(ignoreErrors === 'all' ? null : e, d))
        .catch((e: Error) => {
          // if I should ignore every error, return
          if (ignoreErrors === 'all') return;

          // if it's a pathspec error...
          if (
            e.message.includes('fatal: pathspec') &&
            e.message.includes('did not match any files')
          ) {
            if (ignoreErrors === 'pathspec') return;

            const peh = getInput('pathspec_error_handling'),
              err = new Error(
                `Remove command did not match any file:\n  git rm ${args}`,
              );
            if (peh === 'exitImmediately') throw err;
            if (peh === 'exitAtEnd') exitErrors.push(err);
          } else throw e;
        }),
    );
  }

  return res;
}
