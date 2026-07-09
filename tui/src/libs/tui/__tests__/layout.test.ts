import { describe, expect, it } from 'vitest';
import { resolveHomeScreenLayout } from '@libs/tui/layout.ts';
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
