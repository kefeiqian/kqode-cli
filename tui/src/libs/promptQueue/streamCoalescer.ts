/** Batches streamed text deltas and flushes them on a trailing-edge timer. */
export type DeltaCoalescer = {
  /** Buffers `delta` and schedules a flush if none is already pending. */
  push: (delta: string) => void;
  /** Emits any buffered text now and clears the pending flush. */
  flush: () => void;
  /** Clears the pending flush and discards any buffered text. */
  cancel: () => void;
};

/**
 * Coalesces streamed text deltas so a consumer re-renders at most once per
 * `intervalMs` (a max-fps ceiling) instead of once per token.
 *
 * `push` appends to a buffer and, when no flush is pending, schedules one
 * `intervalMs` later; `emit` then receives the whole batch in a single call.
 * Windows with no new deltas emit nothing, so the effective flush rate floats
 * down to the delta arrival rate and is capped at `1000 / intervalMs` fps —
 * adaptive without tracking anything but the deltas themselves.
 *
 * Trailing-edge only (no leading flush) and clock-free (pure `setTimeout`), so a
 * caller drives it deterministically in tests with fake timers.
 */
export function createDeltaCoalescer(
  emit: (batch: string) => void,
  intervalMs: number
): DeltaCoalescer {
  let buffer = '';
  let timer: ReturnType<typeof setTimeout> | undefined;

  const flush = (): void => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    if (buffer.length === 0) {
      return;
    }
    const batch = buffer;
    buffer = '';
    emit(batch);
  };

  return {
    push(delta: string): void {
      if (delta.length === 0) {
        return;
      }
      buffer += delta;
      if (timer === undefined) {
        timer = setTimeout(flush, intervalMs);
      }
    },
    flush,
    cancel(): void {
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
      buffer = '';
    }
  };
}
