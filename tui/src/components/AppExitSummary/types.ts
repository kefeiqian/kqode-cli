import type { GitLineDelta } from '@libs/git/lineDelta.ts';

/** Foreground colorizer seam — real ANSI in production, identity in tests. */
export type Colorize = (text: string, hex: string) => string;

/**
 * Values the exit summary card renders. `changes`, `durationMs`, and
 * `resumeCommand` are `undefined` when unavailable, in which case their row is
 * omitted entirely. Cost and Tokens have no data source in this slice, so they
 * are always omitted for now.
 */
export type ExitSummaryData = {
  changes: GitLineDelta | undefined;
  durationMs: number | undefined;
  resumeCommand: string | undefined;
};
