import { describe, expect, it, vi } from 'vitest';
import { createStore } from 'jotai';

const { mockSetTerminalBackground } = vi.hoisted(() => ({
  mockSetTerminalBackground: vi.fn()
}));

vi.mock('@libs/terminal/terminalBackground.ts', () => ({
  setTerminalBackground: mockSetTerminalBackground,
  resetTerminalBackground: vi.fn()
}));

import { THEME_CATALOG } from '@theme/themeConfig.ts';
import { activeThemeAtom, applyThemeAtom } from '@state/global/index.ts';
import {
  confirmThemeAtom,
  moveThemeHighlightAtom,
  revertThemePreviewAtom,
  THEME_DOCK_CHROME_ROWS,
  themeDesiredRowsAtom,
  themeHighlightIndexAtom,
  themePreviewOriginAtom,
  themeVisibleRowsAtom,
  themeWindowOffsetAtom,
  visibleThemesAtom
} from '@state/ui/theme/index.ts';

describe('theme scroll window', () => {
  it('desires chrome plus one row per catalog entry', () => {
    const store = createStore();
    expect(store.get(themeDesiredRowsAtom)).toBe(THEME_DOCK_CHROME_ROWS + THEME_CATALOG.length);
  });

  it('scrolls the highlight into view when navigating past the window', () => {
    const store = createStore();
    store.set(themeVisibleRowsAtom, 3);
    store.set(moveThemeHighlightAtom, THEME_CATALOG.length - 1);

    expect(store.get(themeHighlightIndexAtom)).toBe(THEME_CATALOG.length - 1);
    expect(store.get(themeWindowOffsetAtom)).toBe(Math.max(0, THEME_CATALOG.length - 3));

    const visible = store.get(visibleThemesAtom);
    expect(visible.length).toBe(3);
    expect(visible).toContain(THEME_CATALOG[THEME_CATALOG.length - 1]);
  });

  it('keeps the highlight clamped to the catalog bounds', () => {
    const store = createStore();
    store.set(themeVisibleRowsAtom, 3);

    store.set(moveThemeHighlightAtom, 100);
    expect(store.get(themeHighlightIndexAtom)).toBe(THEME_CATALOG.length - 1);

    store.set(moveThemeHighlightAtom, -100);
    expect(store.get(themeHighlightIndexAtom)).toBe(0);
    expect(store.get(themeWindowOffsetAtom)).toBe(0);
  });
});

describe('theme live preview', () => {
  it('applies the highlighted theme in memory when navigating', () => {
    const store = createStore();
    store.set(themeVisibleRowsAtom, THEME_CATALOG.length);

    store.set(moveThemeHighlightAtom, 2);

    expect(store.get(themeHighlightIndexAtom)).toBe(2);
    expect(store.get(activeThemeAtom)).toBe(THEME_CATALOG[2]);
  });

  it('reverts the applied theme to the captured origin and clears it', () => {
    const store = createStore();
    store.set(themePreviewOriginAtom, THEME_CATALOG[0]);
    store.set(applyThemeAtom, THEME_CATALOG[3]); // stand in for a live preview

    store.set(revertThemePreviewAtom);

    expect(store.get(activeThemeAtom)).toBe(THEME_CATALOG[0]);
    expect(store.get(themePreviewOriginAtom)).toBeNull();
  });

  it('confirm adopts the theme as the baseline so a later revert keeps it', () => {
    const store = createStore();
    store.set(themePreviewOriginAtom, THEME_CATALOG[0]); // opened on theme 0

    store.set(confirmThemeAtom, THEME_CATALOG[3]); // Enter on theme 3
    expect(store.get(activeThemeAtom)).toBe(THEME_CATALOG[3]);
    expect(store.get(themePreviewOriginAtom)).toBe(THEME_CATALOG[3]);

    store.set(revertThemePreviewAtom); // close must not undo a confirmed choice
    expect(store.get(activeThemeAtom)).toBe(THEME_CATALOG[3]);
  });
});
