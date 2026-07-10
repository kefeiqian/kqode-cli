import { describe, expect, it } from 'vitest';
import { resolveHomeScreenLayout, resolveDockedPanelRows, resolveWindowOffset } from '@libs/tui/layout.ts';
import {
  COMPOSER_BACKGROUND_PADDING_ROWS,
  COMPOSER_MAX_HEIGHT_DIVISOR
} from '@constants/ui.ts';

const COMPOSER_ERROR_RESERVE_ROWS = 1;

describe('resolveHomeScreenLayout with a command menu', () => {
  it('reflows the body by the menu height when the transcript fills the pane', () => {
    const withoutMenu = resolveHomeScreenLayout(24, 1000, 3, 1, 0);
    const withMenu = resolveHomeScreenLayout(24, 1000, 3, 1, 3);

    expect(withMenu.bodyRows).toBe(withoutMenu.bodyRows - 3);
    expect(withMenu.bodyRows).toBeGreaterThanOrEqual(1);
  });

  it('never drops the body below one row', () => {
    const layout = resolveHomeScreenLayout(12, 1000, 3, 1, 8);
    expect(layout.bodyRows).toBeGreaterThanOrEqual(1);
  });
});

describe('resolveHomeScreenLayout with a resume panel', () => {
  it('reflows the body by the panel height and hides cwd rows', () => {
    const layout = resolveHomeScreenLayout(24, 1000, 3, 1, 0, 12);

    expect(layout.bodyRows).toBe(24 - 1 - 12);
    expect(layout.cwdRows).toBe(0);
    expect(layout.composerVisibleRows).toBe(1);
  });

  it('preserves at least one body row on short terminals', () => {
    const layout = resolveHomeScreenLayout(12, 1000, 3, 1, 0, 10);

    expect(layout.bodyRows).toBeGreaterThanOrEqual(1);
    expect(layout.cwdRows).toBe(0);
  });
});

describe('resolveHomeScreenLayout composer height cap', () => {
  it.each([24, 40, 15])('caps the composer box within floor(rows/2) at rows=%i', (rows) => {
    const layout = resolveHomeScreenLayout(rows, 1000, 3, 1, 0);
    const boxRows =
      layout.composerVisibleRows + COMPOSER_BACKGROUND_PADDING_ROWS + COMPOSER_ERROR_RESERVE_ROWS;

    expect(boxRows).toBeLessThanOrEqual(Math.floor(rows / COMPOSER_MAX_HEIGHT_DIVISOR));
    expect(layout.composerVisibleRows).toBeGreaterThanOrEqual(1);
    expect(layout.bodyRows).toBeGreaterThanOrEqual(1);
  });

  it('stops composer growth at the cap regardless of transcript length', () => {
    const short = resolveHomeScreenLayout(24, 2, 3, 1, 0);
    const long = resolveHomeScreenLayout(24, 100_000, 3, 1, 0);
    const expected =
      Math.floor(24 / COMPOSER_MAX_HEIGHT_DIVISOR) -
      COMPOSER_BACKGROUND_PADDING_ROWS -
      COMPOSER_ERROR_RESERVE_ROWS;

    expect(long.composerVisibleRows).toBe(short.composerVisibleRows);
    expect(long.composerVisibleRows).toBe(expected);
  });
});

describe('resolveDockedPanelRows', () => {
  it('caps a tall desired height at half the terminal', () => {
    expect(resolveDockedPanelRows({ rows: 24, desiredRows: 14 })).toBe(12);
  });

  it('sizes to content when shorter than the cap', () => {
    expect(resolveDockedPanelRows({ rows: 40, desiredRows: 6 })).toBe(6);
  });

  it('never exceeds half and keeps a body row at the minimum terminal height', () => {
    const rows = 15;
    const panel = resolveDockedPanelRows({ rows, desiredRows: 20 });
    expect(panel).toBe(Math.floor(rows / 2));
    expect(panel).toBeLessThanOrEqual(rows - 1 - 1);
  });

  it('returns zero when nothing is desired', () => {
    expect(resolveDockedPanelRows({ rows: 24, desiredRows: 0 })).toBe(0);
  });

  it('floors at one row for a positive desire', () => {
    expect(resolveDockedPanelRows({ rows: 15, desiredRows: 1 })).toBe(1);
  });
});

describe('resolveWindowOffset', () => {
  it('leaves a visible index unchanged', () => {
    expect(resolveWindowOffset({ index: 3, offset: 2, visible: 4, total: 20 })).toBe(2);
  });

  it('scrolls up to reveal an index above the window', () => {
    expect(resolveWindowOffset({ index: 1, offset: 5, visible: 4, total: 20 })).toBe(1);
  });

  it('scrolls down to reveal an index below the window', () => {
    expect(resolveWindowOffset({ index: 10, offset: 2, visible: 4, total: 20 })).toBe(7);
  });

  it('clamps to the last full window', () => {
    expect(resolveWindowOffset({ index: 19, offset: 0, visible: 4, total: 20 })).toBe(16);
  });
});
