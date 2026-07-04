import type { createStore } from 'jotai';
import { computeExitSummary } from '@components/AppExitSummary/computeExitSummary.ts';
import { formatExitSummaryCard } from '@components/AppExitSummary/formatExitSummaryCard.ts';
import type { GitLineDelta } from '@libs/git/lineDelta.ts';
import { colorize as ansiColorize } from '@libs/terminal/ansiColor.ts';
import type { Colorize } from '@components/AppExitSummary/types.ts';
import { DEFAULT_COLUMNS } from '@constants/ui.ts';

type Store = ReturnType<typeof createStore>;

export type PrintExitSummaryDeps = {
  store: Store;
  stream?: NodeJS.WriteStream;
  now?: () => number;
  readLineDelta?: (cwd: string) => GitLineDelta | undefined;
  colorize?: Colorize;
};

/**
 * Writes the exit summary card to `stream` on a clean exit.
 *
 * No-ops on a non-TTY stream (pipes, redirects, tests) so captured output stays
 * free of the card and its color escapes. Terminal width is read from
 * `stream.columns` so the card degrades to fit. Runs after the app has left the
 * alternate screen, so the card lands in the user's restored scrollback with the
 * shell prompt below it. Any failure is swallowed — a broken summary must never
 * turn a clean shutdown into a crash.
 */
export function printExitSummary({
  store,
  stream = process.stdout,
  now = Date.now,
  readLineDelta,
  colorize = ansiColorize
}: PrintExitSummaryDeps): void {
  if (!stream.isTTY) {
    return;
  }

  try {
    const data = computeExitSummary({ store, now, readLineDelta });
    const columns = stream.columns ?? DEFAULT_COLUMNS;
    stream.write(`${formatExitSummaryCard(data, { colorize, columns })}\n`);
  } catch {
    // A summary is a courtesy; never let it break teardown.
  }
}
