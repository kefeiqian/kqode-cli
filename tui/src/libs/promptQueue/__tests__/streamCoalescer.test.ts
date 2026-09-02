import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDeltaCoalescer } from '@libs/promptQueue/streamCoalescer.ts';

const INTERVAL_MS = 66;

describe('createDeltaCoalescer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('coalesces deltas within one interval into a single emit', () => {
    const batches: string[] = [];
    const coalescer = createDeltaCoalescer((batch) => batches.push(batch), INTERVAL_MS);

    coalescer.push('a');
    coalescer.push('b');
    coalescer.push('c');
    expect(batches).toEqual([]);

    vi.advanceTimersByTime(INTERVAL_MS);
    expect(batches).toEqual(['abc']);
  });

  it('starts a fresh batch after each flush window', () => {
    const batches: string[] = [];
    const coalescer = createDeltaCoalescer((batch) => batches.push(batch), INTERVAL_MS);

    coalescer.push('a');
    vi.advanceTimersByTime(INTERVAL_MS);
    coalescer.push('b');
    vi.advanceTimersByTime(INTERVAL_MS);

    expect(batches).toEqual(['a', 'b']);
  });

  it('flush() emits buffered text immediately and clears the pending timer', () => {
    const batches: string[] = [];
    const coalescer = createDeltaCoalescer((batch) => batches.push(batch), INTERVAL_MS);

    coalescer.push('x');
    coalescer.flush();
    expect(batches).toEqual(['x']);

    vi.advanceTimersByTime(INTERVAL_MS);
    expect(batches).toEqual(['x']);
  });

  it('cancel() discards buffered text without emitting', () => {
    const batches: string[] = [];
    const coalescer = createDeltaCoalescer((batch) => batches.push(batch), INTERVAL_MS);

    coalescer.push('y');
    coalescer.cancel();

    vi.advanceTimersByTime(INTERVAL_MS);
    expect(batches).toEqual([]);
  });

  it('ignores empty deltas', () => {
    const batches: string[] = [];
    const coalescer = createDeltaCoalescer((batch) => batches.push(batch), INTERVAL_MS);

    coalescer.push('');
    vi.advanceTimersByTime(INTERVAL_MS);
    expect(batches).toEqual([]);
  });
});
