import { ThemeId } from '@theme/themeTypes.ts';
import { THEME_PRESETS } from '@theme/themePresets.ts';
import type { BuiltInTheme } from '@theme/themePresets.ts';

export type { BuiltInTheme } from '@theme/themePresets.ts';

export const DEFAULT_THEME_ID = ThemeId.TokyoNight;

/** Built-in presets shown in the `/theme` picker, sorted alphabetically by label. */
export const THEME_CATALOG: readonly BuiltInTheme[] = [...THEME_PRESETS].sort((left, right) =>
  left.label.localeCompare(right.label)
);

/** Active preset when no valid saved theme id exists (Tokyo Night). */
export const DEFAULT_THEME = findTheme(DEFAULT_THEME_ID) ?? THEME_PRESETS[0];

export function findTheme(themeId: string): BuiltInTheme | undefined {
  return THEME_CATALOG.find((theme) => theme.id === themeId);
}

export function resolveTheme(themeId: string | null | undefined): BuiltInTheme {
  return themeId === null || themeId === undefined ? DEFAULT_THEME : findTheme(themeId) ?? DEFAULT_THEME;
}

export function isBuiltInThemeId(themeId: string): themeId is ThemeId {
  return findTheme(themeId) !== undefined;
}
