import { atom } from 'jotai';
import { DEFAULT_THEME } from '@theme/themeConfig.ts';
import type { ThemeDefinition } from '@theme/themeConfig.ts';
import { setTerminalBackground } from '@libs/terminal/terminalBackground.ts';

/**
 * The currently active theme. Every TUI render consumer reads its semantic
 * colors from here, so writing a new theme re-renders the whole surface. The
 * composition root seeds it before the first frame; the `/theme` picker updates
 * it on confirm.
 */
export const activeThemeAtom = atom<ThemeDefinition>(DEFAULT_THEME);

/**
 * The single side-effecting seam for a theme change: updates
 * {@link activeThemeAtom} and syncs the terminal background (OSC 11) together,
 * so no component writes the escape sequence directly. Terminal background
 * follows the in-memory active theme (not persisted state), so a failed save
 * still looks consistent for the session.
 */
export const applyThemeAtom = atom(null, (_get, set, theme: ThemeDefinition) => {
  set(activeThemeAtom, theme);
  setTerminalBackground(theme.colors.terminalBackground);
});
