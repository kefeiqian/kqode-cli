import { describe, expect, it } from 'vitest';
import {
  HIDDEN_HEADER_ROWS,
  resolveHomeScreenLayout,
  resolveDockedPanelRows,
  resolveDockedFooterGap,
  resolveWindowOffset,
  positionIndicator
} from '@libs/tui/layout.ts';
import {
  COMPOSER_BACKGROUND_PADDING_ROWS,
  COMPOSER_MAX_HEIGHT_DIVISOR
} from '@constants/ui.ts';

const COMPOSER_ERROR_RESERVE_ROWS = 1;

describe('resolveHomeScreenLayout with a command menu', () => {
  it('reflows the body by the menu height when the transcript fills the pane', () => {
    const withoutMenu = resolveHomeScreenLayout({
      rows: 24,
      bodyEntryCount: 1000,
      composerRows: 3,
      cwdRows: 1,
      commandMenuRows: 0
    });
    const withMenu = resolveHomeScreenLayout({
      rows: 24,
      bodyEntryCount: 1000,
      composerRows: 3,
      cwdRows: 1,
      commandMenuRows: 3
    });

    expect(withMenu.bodyRows).toBe(withoutMenu.bodyRows - 3);
    expect(withMenu.bodyRows).toBeGreaterThanOrEqual(1);
  });

  it('never drops the body below one row', () => {
    const layout = resolveHomeScreenLayout({
      rows: 12,
      bodyEntryCount: 1000,
      composerRows: 3,
      cwdRows: 1,
      commandMenuRows: 8
    });
    expect(layout.bodyRows).toBeGreaterThanOrEqual(1);
  });

  it('gives the body the reclaimed header row when the home header is hidden', () => {
    const withHeader = resolveHomeScreenLayout({
      rows: 24,
      bodyEntryCount: 1000,
      composerRows: 3,
      cwdRows: 1,
      commandMenuRows: 0
    });
    const withoutHeader = resolveHomeScreenLayout({
      rows: 24,
      bodyEntryCount: 1000,
      composerRows: 3,
      cwdRows: 1,
      commandMenuRows: 0,
      headerRows: HIDDEN_HEADER_ROWS
    });

    expect(withoutHeader.bodyRows).toBe(withHeader.bodyRows + 1);
  });
});

describe('resolveHomeScreenLayout with a resume panel', () => {
  it('reflows the body by the panel height and hides cwd rows', () => {
    const layout = resolveHomeScreenLayout({
      rows: 24,
      bodyEntryCount: 1000,
      composerRows: 3,
      cwdRows: 1,
      commandMenuRows: 0,
      resumePanelRows: 12
    });

    expect(layout.bodyRows).toBe(24 - 1 - 12);
    expect(layout.cwdRows).toBe(0);
    expect(layout.composerVisibleRows).toBe(1);
  });

  it('preserves at least one body row on short terminals', () => {
    const layout = resolveHomeScreenLayout({
      rows: 12,
      bodyEntryCount: 1000,
      composerRows: 3,
      cwdRows: 1,
      commandMenuRows: 0,
      resumePanelRows: 10
    });

    expect(layout.bodyRows).toBeGreaterThanOrEqual(1);
    expect(layout.cwdRows).toBe(0);
  });
});

describe('resolveHomeScreenLayout composer height cap', () => {
  it.each([24, 40, 15])('caps the composer box within floor(rows/2) at rows=%i', (rows) => {
    const layout = resolveHomeScreenLayout({
      rows,
      bodyEntryCount: 1000,
      composerRows: 3,
      cwdRows: 1,
      commandMenuRows: 0
    });
    const boxRows =
      layout.composerVisibleRows + COMPOSER_BACKGROUND_PADDING_ROWS + COMPOSER_ERROR_RESERVE_ROWS;

    expect(boxRows).toBeLessThanOrEqual(Math.floor(rows / COMPOSER_MAX_HEIGHT_DIVISOR));
    expect(layout.composerVisibleRows).toBeGreaterThanOrEqual(1);
    expect(layout.bodyRows).toBeGreaterThanOrEqual(1);
  });

  it('stops composer growth at the cap regardless of transcript length', () => {
    const short = resolveHomeScreenLayout({
      rows: 24,
      bodyEntryCount: 2,
      composerRows: 3,
      cwdRows: 1,
      commandMenuRows: 0
    });
    const long = resolveHomeScreenLayout({
      rows: 24,
      bodyEntryCount: 100_000,
      composerRows: 3,
      cwdRows: 1,
      commandMenuRows: 0
    });
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

describe('resolveDockedFooterGap', () => {
  it('keeps the footer gap and full chrome by default', () => {
    expect(resolveDockedFooterGap({ panelRows: 10, chromeWithGap: 4 })).toEqual({
      showFooterGap: true,
      chromeRows: 4
    });
  });

  it('keeps the gap even when capped, as long as a selectable row still fits', () => {
    expect(resolveDockedFooterGap({ panelRows: 7, chromeWithGap: 4 })).toEqual({
      showFooterGap: true,
      chromeRows: 4
    });
  });

  it('yields the gap only when a reserved header would leave zero selectable rows', () => {
    // /memory at the hard cap: 7 - 6 - 1 = 0 < 1, so the gap yields its row.
    expect(resolveDockedFooterGap({ panelRows: 7, chromeWithGap: 6, reservedContentRows: 1 })).toEqual({
      showFooterGap: false,
      chromeRows: 5
    });
  });

  it('keeps the gap once a header-reserving surface has room for one data row', () => {
    // 8 - 6 - 1 = 1 >= 1, so the gap stays.
    expect(resolveDockedFooterGap({ panelRows: 8, chromeWithGap: 6, reservedContentRows: 1 })).toEqual({
      showFooterGap: true,
      chromeRows: 6
    });
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

describe('positionIndicator', () => {
  it('shows nothing when the list fits', () => {
    expect(positionIndicator(0, 0)).toBe('');
  });

  it('shows more-down at the top of a scrollable list', () => {
    expect(positionIndicator(0, 5)).toBe('more ↓');
  });

  it('shows more-up at the bottom of a scrollable list', () => {
    expect(positionIndicator(5, 5)).toBe('more ↑');
  });

  it('shows both arrows in the middle of a scrollable list', () => {
    expect(positionIndicator(2, 5)).toBe('more ↑↓');
  });
});
