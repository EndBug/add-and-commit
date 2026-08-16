import {parseArgsStringToArgv} from 'string-argv';
import * as core from '@actions/core';
import * as YAML from 'js-yaml';
import {getOctokit} from '@actions/github';
import {execFileSync} from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import {getInput} from './io';

/**
 * Resolves the action working directory from the `cwd` input.
 * Absolute paths are kept as-is; relative paths are resolved against `from`
 * (default: `process.cwd()`). Empty input is treated as `'.'`.
 */
export function resolveBaseDir(
  cwdInput: string,
  from: string = process.cwd(),
): string {
  return path.resolve(from, cwdInput || '.');
}

/**
 * Ensures `dir` exists and is a directory before constructing simple-git.
 */
export function assertWorkingDirectory(dir: string, cwdInput: string): void {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    throw new Error(
      `The cwd input '${neutralizeLogString(cwdInput || '.')}' resolved to '${neutralizeLogString(dir)}', which is not an existing directory. ` +
        'Use a path relative to the runner workspace, or an absolute path that exists ' +
        '(e.g. ${{ github.workspace }}/path — note that $GITHUB_WORKSPACE is not expanded in with:).',
    );
  }
}

function getOctokitClient() {
  const token = getInput('github_token');
  if (!token) {
    throw new Error('github_token is required');
  }
  return getOctokit(token);
}

export async function getUserInfo(username?: string) {
  if (!username) return undefined;

  const octokit = getOctokitClient();
  const res = await octokit.rest.users.getByUsername({username});

  core.debug(
    `Fetched github actor from the API: ${JSON.stringify(res?.data, null, 2)}`,
  );

  return {
    name: res?.data?.name,
    email: res?.data?.email,
  };
}

/**
 * Characters that can spoof or inject into CI logs when printed raw:
 * C0/C1 controls + DEL, Unicode line/paragraph separators (U+2028/U+2029),
 * and Unicode bidi/isolate format controls (Trojan Source class:
 * RLO/LRO/PDF/RLE/LRE/RLI/LRI/FSI/PDI, LRM/RLM, ALM).
 */
const LOG_UNSAFE_CHARS =
  // eslint-disable-next-line no-control-regex
  /[\u0000-\u001F\u007F-\u009F\u061C\u200E\u200F\u2028-\u202E\u2066-\u2069]/gu;

/**
 * Replaces log-unsafe characters with visible `\uXXXX` escapes so bidi
 * reordering and control-char injection cannot alter how paths render in logs.
 */
export function neutralizeLogString(s: string): string {
  return s.replace(LOG_UNSAFE_CHARS, ch => {
    const hex = ch.codePointAt(0)!.toString(16).padStart(4, '0');
    return `\\u${hex}`;
  });
}

/**
 * `core.info` writes straight to stdout with no escaping, so the Actions
 * runner would treat a newline followed by `::command::` as a workflow
 * command. Neutralize first so user-controlled strings cannot inject that.
 */
export function safeInfo(message: string): void {
  // Direct core.info is forbidden elsewhere (no-restricted-syntax).
  // eslint-disable-next-line no-restricted-syntax
  core.info(neutralizeLogString(message));
}

const CIRCULAR_LOG_MARKER = '[Circular]';

/**
 * Recursively neutralizes strings in values passed to log sinks (StatusSummary,
 * commit results, Error messages, etc.).
 * Tracks visited arrays/objects so circular references become a marker instead
 * of overflowing the stack.
 */
export function neutralizeForLog(
  value: unknown,
  seen: WeakSet<object> = new WeakSet(),
): unknown {
  if (typeof value === 'string') return neutralizeLogString(value);
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value === null ||
    value === undefined
  ) {
    return value;
  }
  if (value instanceof Error) {
    const sanitized = new Error(neutralizeLogString(value.message));
    sanitized.name = neutralizeLogString(value.name);
    if (value.stack) {
      sanitized.stack = neutralizeLogString(value.stack);
    }
    return sanitized;
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) return CIRCULAR_LOG_MARKER;
    seen.add(value);
    return value.map(item => neutralizeForLog(item, seen));
  }
  if (typeof value === 'object') {
    if (seen.has(value)) return CIRCULAR_LOG_MARKER;
    seen.add(value);
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(
      value as Record<string, unknown>,
    )) {
      out[neutralizeLogString(key)] = neutralizeForLog(nested, seen);
    }
    return out;
  }
  return value;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function log(err: any, data?: any) {
  if (data) console.log(neutralizeForLog(data));
  if (err) {
    const sanitized = neutralizeForLog(err);
    if (typeof sanitized === 'string' || sanitized instanceof Error) {
      core.error(sanitized);
    } else {
      core.error(String(sanitized));
    }
  }
}

/** Git identity keys this action sets; safe to log (no credentials). */
const GIT_IDENTITY_CONFIG_KEYS = [
  'user.name',
  'user.email',
  'author.name',
  'author.email',
  'committer.name',
  'committer.email',
] as const;

/**
 * Picks only git identity config entries for logging.
 * Never includes credential-bearing keys (extraheader, remote URLs, etc.).
 */
export function pickGitIdentityConfig(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of GIT_IDENTITY_CONFIG_KEYS) {
    if (Object.prototype.hasOwnProperty.call(config, key)) {
      result[key] = config[key];
    }
  }
  return result;
}

/**
 * Ensures `name` is safe to pass as a single git branch/ref positional argument.
 * Rejects empty values, leading hyphens (git option injection), whitespace/control
 * chars, and names rejected by `git check-ref-format --branch`.
 */
export function assertValidBranchName(name: string): void {
  if (!name || !name.trim()) {
    throw new Error('The new_branch value is empty.');
  }
  if (name.startsWith('-')) {
    throw new Error(
      `The new_branch value '${neutralizeLogString(name)}' cannot start with '-' (it would be interpreted as a git option).`,
    );
  }
  for (const char of name) {
    const code = char.codePointAt(0)!;
    if (
      code <= 0x1f || // C0 controls
      code === 0x7f || // DEL
      (code >= 0x80 && code <= 0x9f) || // C1 controls
      /\s/u.test(char) // Unicode whitespace (e.g. NBSP)
    ) {
      throw new Error(
        `The new_branch value '${neutralizeLogString(name)}' contains whitespace or control characters.`,
      );
    }
  }

  try {
    // Leading '-' is already rejected above so this cannot be parsed as a flag.
    execFileSync('git', ['check-ref-format', '--branch', name], {
      stdio: 'ignore',
    });
  } catch {
    throw new Error(
      `The new_branch value '${neutralizeLogString(name)}' is not a valid git branch name.`,
    );
  }
}

/**
 * Remote-helper overrides that make the local git client execute an arbitrary
 * program during fetch/pull/push. Git also accepts unique abbreviations of
 * these long options, so we reject every valid nonempty prefix of each name.
 *
 * `minPrefix` is the shortest unambiguous abbreviation Git currently accepts
 * for that option (shorter prefixes are ambiguous and rejected by Git itself).
 */
const DANGEROUS_REMOTE_HELPER_OPTIONS: ReadonlyArray<{
  canonical: string;
  minPrefix: string;
}> = [
  {canonical: 'upload-pack', minPrefix: 'upl'},
  {canonical: 'receive-pack', minPrefix: 'rece'},
  {canonical: 'exec', minPrefix: 'e'},
];

/**
 * Long options that read a commit/tag message from a filesystem path.
 * Git accepts unique abbreviations (`--fi` → `--file`); `minPrefix` is the
 * shortest unambiguous abbreviation currently accepted for `git tag`.
 */
const DANGEROUS_MESSAGE_FILE_OPTIONS: ReadonlyArray<{
  canonical: string;
  minPrefix: string;
}> = [{canonical: 'file', minPrefix: 'fi'}];

/**
 * Long options that make Git read pathspecs from a filesystem path.
 * Git accepts unique abbreviations (`--pathspec-fr` → `--pathspec-from-file`);
 * `minPrefix` is the shortest unambiguous abbreviation currently accepted.
 * `--pathspec-file-nul` is blocked with them (it changes how that file is parsed).
 */
const DANGEROUS_PATHSPEC_FILE_OPTIONS: ReadonlyArray<{
  canonical: string;
  minPrefix: string;
}> = [
  {canonical: 'pathspec-from-file', minPrefix: 'pathspec-fr'},
  {canonical: 'pathspec-file-nul', minPrefix: 'pathspec-fi'},
];

/**
 * Long options whose next argv token is a value, not another option.
 * Used so literals like `-m '-F'` are not treated as a message-file flag.
 */
const LONG_OPTIONS_WITH_SEPARATE_ARG: ReadonlyArray<{
  canonical: string;
  minPrefix: string;
}> = [
  {canonical: 'message', minPrefix: 'mes'},
  {canonical: 'local-user', minPrefix: 'local-'},
  {canonical: 'cleanup', minPrefix: 'cleanup'},
  {canonical: 'file', minPrefix: 'fi'},
  {canonical: 'pathspec-from-file', minPrefix: 'pathspec-fr'},
  {canonical: 'upload-pack', minPrefix: 'upl'},
  {canonical: 'receive-pack', minPrefix: 'rece'},
  {canonical: 'exec', minPrefix: 'e'},
];

/**
 * Short options that take a value (glued or as the following argv token).
 * `-u` is intentionally omitted: it only takes a key-id for `git tag`, while
 * `git fetch` (`--update-head-ok`) and `git push` (`--set-upstream`) treat it
 * as a flag. Tag signing still uses `--local-user` in
 * `LONG_OPTIONS_WITH_SEPARATE_ARG`.
 */
const SHORT_OPTIONS_WITH_ARG = new Set(['m', 'F']);

function getLongOptionName(arg: string): string | undefined {
  if (!arg.startsWith('--') || arg === '--') return undefined;
  const body = arg.slice(2);
  const eq = body.indexOf('=');
  return (eq === -1 ? body : body.slice(0, eq)).toLowerCase();
}

function longOptionHasInlineValue(arg: string): boolean {
  if (!arg.startsWith('--') || arg === '--') return false;
  return arg.slice(2).includes('=');
}

function matchesLongOptionPrefix(
  arg: string,
  options: ReadonlyArray<{canonical: string; minPrefix: string}>,
): boolean {
  const name = getLongOptionName(arg);
  if (!name) return false;
  return options.some(
    ({canonical, minPrefix}) =>
      name.length >= minPrefix.length && canonical.startsWith(name),
  );
}

function isDangerousRemoteHelperOption(arg: string): boolean {
  return matchesLongOptionPrefix(arg, DANGEROUS_REMOTE_HELPER_OPTIONS);
}

/**
 * True for `-F`, glued forms like `-F/path`, and short-option clusters that
 * include `F` as an option letter (e.g. `-aF`). Values glued after an
 * argument-taking option (e.g. `-m-F`) are not treated as flags. Lowercase
 * `-f` (force) is intentionally allowed.
 */
function isDangerousMessageFileShortOption(arg: string): boolean {
  if (!arg.startsWith('-') || arg.startsWith('--')) return false;
  const body = arg.slice(1);
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === 'F') return true;
    if (SHORT_OPTIONS_WITH_ARG.has(ch)) {
      // Remainder is the option's value, not further option letters.
      return false;
    }
  }
  return false;
}

function isDangerousMessageFileOption(arg: string): boolean {
  return (
    matchesLongOptionPrefix(arg, DANGEROUS_MESSAGE_FILE_OPTIONS) ||
    isDangerousMessageFileShortOption(arg)
  );
}

function isDangerousPathspecFileOption(arg: string): boolean {
  return matchesLongOptionPrefix(arg, DANGEROUS_PATHSPEC_FILE_OPTIONS);
}

/**
 * Whether this token causes Git to treat the next argv element as a value
 * (so that value must not be classified as an option).
 */
function consumesFollowingArgument(arg: string): boolean {
  if (arg.startsWith('--') && arg !== '--') {
    if (longOptionHasInlineValue(arg)) return false;
    return matchesLongOptionPrefix(arg, LONG_OPTIONS_WITH_SEPARATE_ARG);
  }
  if (!arg.startsWith('-') || arg.startsWith('--')) return false;

  const body = arg.slice(1);
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (SHORT_OPTIONS_WITH_ARG.has(ch)) {
      // Glued value after the option letter → no separate following argv.
      return i === body.length - 1;
    }
  }
  return false;
}

/**
 * Conservative argument-boundary check for quotes before `string-argv` runs.
 * Not every rejected form would become extra argv words.
 *
 * Unmatched `'` / `"` are rejected (e.g. `origin fix'--force`).
 * A quoted segment is accepted only when its closing quote is followed by
 * whitespace or end of input (`origin 'main' --force`, `--message='hello'`).
 * Interior glued quotes such as `a'b'c` are rejected even though `string-argv`
 * would keep that as one token. A start-quoted token with text after the closer
 * (`'main'--force`) is also rejected; that form would split into extra argv
 * words.
 *
 * The opposite quote type inside a quoted segment is allowed.
 */
function assertSafeQuotes(input: string): void {
  let open: "'" | '"' | null = null;
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (char !== "'" && char !== '"') continue;
    if (open === null) {
      open = char;
    } else if (open === char) {
      open = null;
      const next = input[i + 1];
      if (next !== undefined && !/\s/.test(next)) {
        throw new Error(
          'Git arguments contain a quoted segment immediately followed by non-whitespace. string-argv would split that into extra arguments (for example a quoted name glued to --force).',
        );
      }
    }
  }
  if (open !== null) {
    throw new Error(
      `Git arguments contain an unmatched ${open} quote. Unclosed quotes are rejected because they cause ambiguous argument splitting.`,
    );
  }
}

/**
 * Git remote-helper URL form (`ext::command`, `hg::…`, etc.).
 * @see https://git-scm.com/docs/gitremote-helpers
 */
const REMOTE_HELPER_URL = /^[A-Za-z0-9+.-]+::/;

function isRemoteHelperUrl(arg: string): boolean {
  return REMOTE_HELPER_URL.test(arg);
}

export type MatchGitArgsOptions = {
  /**
   * When true, allow `scheme::` remote-helper URL tokens.
   * Does not disable `--upload-pack` / `-F` / `--pathspec-from-file` denylists.
   */
  allowUnsafeGitProtocols?: boolean;
};

/**
 * Matches the given string to an array of arguments.
 * The parsing is made by `string-argv`: if your way of using argument is not supported, the issue is theirs!
 * {@link https://www.npm.im/string-argv}
 * @example
 * ```js
 * matchGitArgs(`
    -s
    --longOption 'This uses the "other" quotes'
    --foo 1234
    --force
    --path="Application 'Support'/\"message\".txt"
  `) => [
    '-s',
    '--longOption',
    'This uses the "other" quotes',
    '--foo',
    '1234',
    '--force',
    `--path="Application 'Support'/\\"message\\".txt"`
  ]
 * matchGitArgs('      ') => [ ]
 * ```
 * @returns An array, if there's no match it'll be empty
 * @throws If the args include unmatched quotes, or a closing quote glued to following text
 * @throws If the args include a blocked remote-helper override (`--upload-pack`, `--receive-pack`, `--exec`, or abbreviations) on any token, including values after `-u` / `-m`
 * @throws If the args include a blocked message-from-file flag (`-F`, `--file`, abbreviations, or short-option clusters containing `F`)
 * @throws If the args include a blocked pathspec-from-file flag (`--pathspec-from-file`, `--pathspec-file-nul`, or abbreviations)
 * @throws If the args include a `scheme::` remote-helper URL (unless `allowUnsafeGitProtocols`)
 */
export function matchGitArgs(
  string: string,
  options: MatchGitArgsOptions = {},
) {
  assertSafeQuotes(string);

  const parsed = parseArgsStringToArgv(string);
  core.debug(`Git args parsed:
  - Original: ${string}
  - Parsed: ${JSON.stringify(parsed)}`);

  const allowUnsafe = options.allowUnsafeGitProtocols === true;

  let skipNext = false;
  for (const arg of parsed) {
    // Remote-helper overrides are rejected on every token, including values
    // after `-m` / `--message`. `-u` must not skip `--upl=` / `--upload-pack`.
    if (isDangerousRemoteHelperOption(arg)) {
      throw new Error(
        `Git argument '${neutralizeLogString(arg)}' is not allowed: overriding the remote helper (--upload-pack, --receive-pack, --exec) can execute arbitrary commands on the runner.`,
      );
    }

    if (skipNext) {
      skipNext = false;
      continue;
    }

    if (isDangerousMessageFileOption(arg)) {
      throw new Error(
        `Git argument '${neutralizeLogString(arg)}' is not allowed: reading a tag/commit message from a file (-F/--file) can exfiltrate runner filesystem contents into git history.`,
      );
    }
    if (isDangerousPathspecFileOption(arg)) {
      throw new Error(
        `Git argument '${neutralizeLogString(arg)}' is not allowed: reading pathspecs from a file (--pathspec-from-file/--pathspec-file-nul) can leak runner filesystem contents into logs.`,
      );
    }
    if (!allowUnsafe && isRemoteHelperUrl(arg)) {
      throw new Error(
        `Git argument '${neutralizeLogString(arg)}' is not allowed: remote-helper URLs (scheme::…) can execute arbitrary commands on the runner. Set allow_unsafe_git_protocols to true only if you fully trust this input.`,
      );
    }

    skipNext = consumesFollowingArgument(arg);
  }

  return parsed;
}

/**
 * Parses `git diff --cached --raw` output and returns paths that would introduce
 * a new gitlink (mode 160000) — i.e. an embedded git repository staged as if it
 * were a submodule. Updates that stay 160000→160000 (existing submodule bumps)
 * are allowed.
 *
 * Raw line shape: `:oldmode newmode oldsha newsha status\tpath`
 * Rename/copy: `:oldmode newmode oldsha newsha status\toldpath\tnewpath`
 * Status may include a score (e.g. `R100`, `C75`).
 */
export function findUnexpectedGitlinks(diffCachedRaw: string): string[] {
  const paths: string[] = [];
  for (const line of diffCachedRaw.split('\n')) {
    if (!line.startsWith(':')) continue;
    const match = line.match(
      /^:(\d{6}) (\d{6}) [0-9a-f]+ [0-9a-f]+ [A-Z]\d*\t([^\t]+)(?:\t(.+))?$/,
    );
    if (!match) continue;
    const [, oldMode, newMode, srcPath, dstPath] = match;
    if (newMode === '160000' && oldMode !== '160000') {
      paths.push(dstPath ?? srcPath);
    }
  }
  return paths;
}

/**
 * Fails the action if `git add` staged any unexpected gitlinks (embedded repos).
 */
export function assertNoUnexpectedGitlinks(paths: string[]): void {
  if (paths.length === 0) return;

  const listed = paths.map(p => `  - ${neutralizeLogString(p)}`).join('\n');
  const rmHints = paths
    .map(p => `  git rm --cached -- ${neutralizeLogString(p)}`)
    .join('\n');
  throw new Error(
    `Refusing to commit unexpected gitlink(s) (embedded git repository staged as mode 160000):\n${listed}\n` +
      'Git records a nested .git directory as a gitlink, not as its files. ' +
      `Remove the nested .git directory, or unstage the path(s) with:\n${rmHints}`,
  );
}

/**
 * Tries to parse a YAML sequence (which can be a JSON array).
 * If it fails, it returns an array containing the input value as its only element.
 */
export function parseInputArray(input: string): string[] {
  core.debug(`Parsing input array: ${input}`);
  try {
    const yaml = YAML.load(input);
    if (yaml && Array.isArray(yaml) && yaml.every(e => typeof e === 'string')) {
      core.debug(`Input parsed as YAML array of length ${yaml.length}`);
      return yaml;
    }
  } catch {} // eslint-disable-line no-empty

  core.debug('Input parsed as single string');
  return [input];
}

export function readJSON(filePath: string) {
  let fileContent: string;
  try {
    fileContent = fs.readFileSync(filePath, {encoding: 'utf8'});
  } catch {
    throw `Couldn't read file. File path: ${neutralizeLogString(filePath)}`;
  }

  try {
    return JSON.parse(fileContent);
  } catch {
    throw `Couldn't parse file to JSON. File path: ${neutralizeLogString(filePath)}`;
  }
}
