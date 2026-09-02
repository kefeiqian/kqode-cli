import { describe, expect, it } from 'vitest';
import { resolveFollowScrollOffset } from '@libs/tui/followScroll.ts';

describe('resolveFollowScrollOffset', () => {
  it('stays pinned to the bottom while the viewport is already pinned', () => {
    expect(
      resolveFollowScrollOffset({ previousOffset: 0, previousMaxOffset: 0, nextMaxOffset: 40 })
    ).toBe(0);
  });

  it('anchors a scrolled-up reader by absorbing rows appended below the viewport', () => {
    // Scrolled up 10 rows; 20 rows streamed in below, so the max grew 60 -> 80.
    expect(
      resolveFollowScrollOffset({ previousOffset: 10, previousMaxOffset: 60, nextMaxOffset: 80 })
    ).toBe(30);
  });

  it('keeps the reader anchored when the transcript shrinks', () => {
    expect(
      resolveFollowScrollOffset({ previousOffset: 15, previousMaxOffset: 40, nextMaxOffset: 35 })
    ).toBe(10);
  });

  it('clamps the anchored offset to the new maximum', () => {
    expect(
      resolveFollowScrollOffset({ previousOffset: 38, previousMaxOffset: 40, nextMaxOffset: 39 })
    ).toBe(37);
  });

  it('never returns a negative offset when the transcript shrinks below the offset', () => {
    expect(
      resolveFollowScrollOffset({ previousOffset: 5, previousMaxOffset: 40, nextMaxOffset: 20 })
    ).toBe(0);
  });
});
