/** Milliseconds within which a following press counts as the same click cycle. */
export const MULTI_CLICK_WINDOW_MS = 500;

/** Cell tolerance (rows and columns) for a press to continue the click cycle. */
export const MULTI_CLICK_CELL_TOLERANCE = 1;

/** Highest click count a cycle reaches (triple) before the next press resets to 1. */
export const MAX_CLICK_COUNT = 3;

/** A single left press remembered so the next press can be classified against it. */
export type PressRecord = {
  /** Epoch milliseconds when the press was observed, from an injected clock. */
  at: number;
  /** 1-based SGR row of the press. */
  row: number;
  /** 1-based SGR column of the press. */
  column: number;
  /** The click count this press resolved to (1 single, 2 double, 3 triple). */
  count: number;
};

/**
 * Classifies a new left press against the `previous` press, returning its click
 * count: 1 for a fresh press, 2 for a double, 3 for a triple, then cycling back
 * to 1 on the fourth rapid press. A press continues the cycle only when it lands
 * within `MULTI_CLICK_WINDOW_MS` of the previous press and within
 * `MULTI_CLICK_CELL_TOLERANCE` cells of it in both axes; otherwise it starts a
 * new cycle at 1.
 *
 * SGR mouse reports carry no native click count, so this is the sole source of
 * truth. The clock is injected by the caller (`press.at`) so the window is
 * testable without real time.
 */
export function classifyClick(
  previous: PressRecord | null,
  press: { at: number; row: number; column: number }
): number {
  if (
    previous !== null &&
    previous.count < MAX_CLICK_COUNT &&
    press.at - previous.at <= MULTI_CLICK_WINDOW_MS &&
    Math.abs(press.row - previous.row) <= MULTI_CLICK_CELL_TOLERANCE &&
    Math.abs(press.column - previous.column) <= MULTI_CLICK_CELL_TOLERANCE
  ) {
    return previous.count + 1;
  }
  return 1;
}
