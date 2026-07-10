import { describe, expect, it } from 'vitest';
import { createStore } from 'jotai';
import { THEME_CATALOG } from '@theme/themeConfig.ts';
import {
  moveThemeHighlightAtom,
  THEME_DOCK_CHROME_ROWS,
  themeDesiredRowsAtom,
  themeHighlightIndexAtom,
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
