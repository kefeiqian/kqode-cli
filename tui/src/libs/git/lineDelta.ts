import { execFileSync } from 'node:child_process';

const GIT_LINE_DELTA_TIMEOUT_MS = 2_000;
// `git diff --shortstat` uses the singular "insertion(+)" / "deletion(-)" when
// exactly one line changes, so both forms must parse.
const INSERTIONS_PATTERN = /(\d+) insertions?\(\+\)/;
const DELETIONS_PATTERN = /(\d+) deletions?\(-\)/;
const SHORTSTAT_MARKER_PATTERN = /\bchanged\b/;

/** Working-tree line churn versus `HEAD`. */
export type GitLineDelta = {
  insertions: number;
  deletions: number;
};

/**
 * Reads the working-tree line delta versus `HEAD` in `cwd` via
 * `git diff --shortstat`.
 *
 * Returns `undefined` when `cwd` is not a git repository, `git` is unavailable,
 * `HEAD` is unborn, or the command times out — callers render a placeholder in
 * that case. Mirrors the guarded, fail-soft shape of `readGitStatusLabel`.
 */
export function readWorkingTreeLineDelta(cwd: string): GitLineDelta | undefined {
  try {
    const shortstat = execFileSync('git', ['-C', cwd, 'diff', '--shortstat', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: GIT_LINE_DELTA_TIMEOUT_MS,
      // Match the windowsHide convention used for every other child spawn
      // (backend + build): the child gets its own hidden console instead of
      // sharing the TUI's ConPTY, so a spawned console tool can never disturb the
      // session's OSC 2 window title. No-op off Windows.
      windowsHide: true
    });

    return parseShortstat(shortstat);
  } catch {
    return undefined;
  }
}

/**
 * Parses `git diff --shortstat` output into a {@link GitLineDelta}.
 *
 * An empty string (clean tree) yields `{ insertions: 0, deletions: 0 }`. A real
 * shortstat line missing `+`/`-` counts (e.g. a mode-only change) also yields
 * zeros. Text that is not shortstat output at all yields `undefined`.
 */
export function parseShortstat(shortstat: string): GitLineDelta | undefined {
  const trimmed = shortstat.trim();
  if (trimmed.length === 0) {
    return { insertions: 0, deletions: 0 };
  }

  const insertions = matchCount(trimmed, INSERTIONS_PATTERN);
  const deletions = matchCount(trimmed, DELETIONS_PATTERN);

  if (insertions === undefined && deletions === undefined) {
    return SHORTSTAT_MARKER_PATTERN.test(trimmed) ? { insertions: 0, deletions: 0 } : undefined;
  }

  return {
    insertions: insertions ?? 0,
    deletions: deletions ?? 0
  };
}

function matchCount(text: string, pattern: RegExp): number | undefined {
  const match = pattern.exec(text);
  return match === null ? undefined : Number(match[1]);
}
