import { atom } from 'jotai';
import { clamp } from '@libs/math/clamp.ts';
import { resolveWindowOffset } from '@libs/tui/layout.ts';
import { THEME_CATALOG } from '@theme/themeConfig.ts';
import type { ThemeDefinition } from '@theme/themeConfig.ts';
import { activeThemeAtom, applyThemeAtom } from '@state/global/index.ts';

/** Non-list rows in the docked `/theme` popup: accent divider, title, gap, footer. */
export const THEME_DOCK_CHROME_ROWS = 4;

/**
 * Picker-local highlight index into {@link THEME_CATALOG}. Moving the highlight
 * live-previews the highlighted theme (applies it in memory plus terminal
 * background) without persisting; Enter persists the preview and Esc reverts to
 * the theme captured in {@link themePreviewOriginAtom}.
 */
export const themeHighlightIndexAtom = atom(0);

/**
 * The theme that was active when the picker opened, captured so Esc/cancel can
 * revert a live preview. `null` once there is nothing to revert to: before the
 * picker opens, and after a preview is committed on a successful save.
 */
export const themePreviewOriginAtom = atom<ThemeDefinition | null>(null);

/** Scroll-window offset over the catalog so the list stays within the cap. */
export const themeWindowOffsetAtom = atom(0);

/** Visible list rows supplied by the surface so the window math lives in atoms. */
export const themeVisibleRowsAtom = atom(1);

/** The catalog slice currently visible in the scroll window. */
export const visibleThemesAtom = atom((get) => {
  const offset = get(themeWindowOffsetAtom);
  return THEME_CATALOG.slice(offset, offset + get(themeVisibleRowsAtom));
});

/**
 * Moves the highlight by `delta` (clamped to the catalog), scrolls it into
 * view, and live-previews the newly highlighted theme by applying it in memory
 * so the interface updates immediately. Persistence still happens only on Enter.
 */
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
  const previewed = THEME_CATALOG[next];
  if (previewed !== undefined) {
    set(applyThemeAtom, previewed);
  }
});

/**
 * Confirms a theme choice (Enter): applies it and promotes it to the preview
 * baseline, so a later cancel/unmount falls back to this confirmed theme rather
 * than the pre-open one — even if persistence then fails. Only an un-confirmed
 * navigation preview is undone on cancel.
 */
export const confirmThemeAtom = atom(null, (_get, set, theme: ThemeDefinition) => {
  set(applyThemeAtom, theme);
  set(themePreviewOriginAtom, theme);
});

/**
 * Reverts an un-confirmed live preview back to the baseline in
 * {@link themePreviewOriginAtom} and then clears it. Skips the re-apply when the
 * active theme already matches the baseline (a confirmed choice, or no preview
 * at all), so a confirmed theme is never undone on close.
 */
export const revertThemePreviewAtom = atom(null, (get, set) => {
  const origin = get(themePreviewOriginAtom);
  if (origin !== null && origin.id !== get(activeThemeAtom).id) {
    set(applyThemeAtom, origin);
  }
  set(themePreviewOriginAtom, null);
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
 * Prepares the picker when the surface opens: clears any stale warning, snapshots
 * the active theme as the preview origin (so Esc/cancel can revert a live
 * preview), and highlights the currently active theme so the picker opens on the
 * user's theme (falling back to the first row for an off-catalog active theme).
 */
export const resetThemeSurfaceAtom = atom(null, (get, set) => {
  set(themeSaveWarningAtom, null);
  set(themeWindowOffsetAtom, 0);
  const active = get(activeThemeAtom);
  set(themePreviewOriginAtom, active);
  const index = THEME_CATALOG.findIndex((theme) => theme.id === active.id);
  set(themeHighlightIndexAtom, index < 0 ? 0 : index);
});
