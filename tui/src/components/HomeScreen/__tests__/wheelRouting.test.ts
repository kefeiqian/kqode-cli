import { describe, expect, it } from 'vitest';
import { isPointerOverComposer, resolveWheelTarget } from '@libs/tui/wheelRouting.ts';

// rows = 24; composer block top at 0-based row 18; status row = 23.
const composerTop = 18;
const rows = 24;

describe('isPointerOverComposer', () => {
  it('is true from the composer top row down to just above the status row', () => {
    expect(isPointerOverComposer(composerTop + 1, composerTop, rows)).toBe(true); // top cap
    expect(isPointerOverComposer(rows - 1, composerTop, rows)).toBe(true); // bottom cap
  });

  it('is false one row above the composer block', () => {
    expect(isPointerOverComposer(composerTop, composerTop, rows)).toBe(false);
  });

  it('is false on the header and on the status row', () => {
    expect(isPointerOverComposer(1, composerTop, rows)).toBe(false); // header
    expect(isPointerOverComposer(rows, composerTop, rows)).toBe(false); // status row
  });
});

describe('resolveWheelTarget', () => {
  const over = { mouseRow: composerTop + 2, composerTop, rows };

  it('routes to the composer when over it and it can scroll', () => {
    expect(resolveWheelTarget({ ...over, composerCanScroll: true })).toBe('composer');
  });

  it('falls through to the body when over a composer that cannot scroll', () => {
    expect(resolveWheelTarget({ ...over, composerCanScroll: false })).toBe('body');
  });

  it('defaults to the body for header/spacer/cwd and status rows', () => {
    expect(resolveWheelTarget({ mouseRow: 2, composerTop, rows, composerCanScroll: true })).toBe('body');
    expect(resolveWheelTarget({ mouseRow: rows, composerTop, rows, composerCanScroll: true })).toBe('body');
  });

  it('defaults to the body for an out-of-range pointer row', () => {
    expect(resolveWheelTarget({ mouseRow: 9999, composerTop, rows, composerCanScroll: true })).toBe('body');
  });
});
