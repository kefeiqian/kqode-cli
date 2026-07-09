import { atom } from 'jotai';
import { THEME_CATALOG } from '@theme/themeConfig.ts';
import { activeThemeAtom } from '@state/global/index.ts';

/**
 * Picker-local highlight index into {@link THEME_CATALOG}. Independent of the
 * active theme: moving the highlight changes only focus, never the applied
 * theme or terminal background (apply happens on Enter, not on highlight).
 */
export const themeHighlightIndexAtom = atom(0);

/** Moves the highlight by `delta`, clamped to the catalog bounds. */
export const moveThemeHighlightAtom = atom(null, (get, set, delta: number) => {
  const next = get(themeHighlightIndexAtom) + delta;
  set(themeHighlightIndexAtom, Math.max(0, Math.min(THEME_CATALOG.length - 1, next)));
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
  const activeId = get(activeThemeAtom).id;
  const index = THEME_CATALOG.findIndex((theme) => theme.id === activeId);
  set(themeHighlightIndexAtom, index < 0 ? 0 : index);
});
