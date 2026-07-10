import { atom } from 'jotai';
import { clamp } from '@libs/math/clamp.ts';
import { resolveWindowOffset } from '@libs/tui/layout.ts';
import { THEME_CATALOG } from '@theme/themeConfig.ts';
import { activeThemeAtom } from '@state/global/index.ts';

/** Non-list rows in the docked `/theme` popup: accent divider, title, footer. */
export const THEME_DOCK_CHROME_ROWS = 3;

/**
 * Picker-local highlight index into {@link THEME_CATALOG}. Independent of the
 * active theme: moving the highlight changes only focus, never the applied
 * theme or terminal background (apply happens on Enter, not on highlight).
 */
export const themeHighlightIndexAtom = atom(0);

/** Scroll-window offset over the catalog so the list stays within the cap. */
export const themeWindowOffsetAtom = atom(0);

/** Visible list rows supplied by the surface so the window math lives in atoms. */
export const themeVisibleRowsAtom = atom(1);

/** Content-derived desired popup height: chrome plus one row per catalog entry. */
export const themeDesiredRowsAtom = atom(() => THEME_DOCK_CHROME_ROWS + THEME_CATALOG.length);

/** The catalog slice currently visible in the scroll window. */
export const visibleThemesAtom = atom((get) => {
  const offset = get(themeWindowOffsetAtom);
  return THEME_CATALOG.slice(offset, offset + get(themeVisibleRowsAtom));
});

/** Moves the highlight by `delta`, clamped to the catalog, and scrolls it into view. */
export const moveThemeHighlightAtom = atom(null, (get, set, delta: number) => {
  const next = clamp(get(themeHighlightIndexAtom) + delta, 0, THEME_CATALOG.length - 1);
  set(themeHighlightIndexAtom, next);
  set(
    themeWindowOffsetAtom,
    resolveWindowOffset({
      index: next,
      offset: get(themeWindowOffsetAtom),
      visible: get(themeVisibleRowsAtom),
      total: THEME_CATALOG.length
    })
  );
});

/** Re-clamps the window so the highlighted theme stays visible after a resize. */
export const scrollThemeHighlightIntoViewAtom = atom(null, (get, set) => {
  set(
    themeWindowOffsetAtom,
    resolveWindowOffset({
      index: get(themeHighlightIndexAtom),
      offset: get(themeWindowOffsetAtom),
      visible: get(themeVisibleRowsAtom),
      total: THEME_CATALOG.length
    })
  );
});

/**
 * Inline unsaved warning shown after Enter when the theme applied for the
 * session but persistence failed; `null` while there is nothing to warn about.
 */
export const themeSaveWarningAtom = atom<string | null>(null);

/**
 * Prepares the picker when the surface opens: clears any stale warning and
 * highlights the currently active theme so the picker opens on the user's
 * theme (falling back to the first row for an off-catalog active theme).
 */
export const resetThemeSurfaceAtom = atom(null, (get, set) => {
  set(themeSaveWarningAtom, null);
  set(themeWindowOffsetAtom, 0);
  const activeId = get(activeThemeAtom).id;
  const index = THEME_CATALOG.findIndex((theme) => theme.id === activeId);
  set(themeHighlightIndexAtom, index < 0 ? 0 : index);
});
