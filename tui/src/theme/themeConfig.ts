import { DEFAULT_THEME } from '@theme/themeCatalog.ts';

export {
  DEFAULT_THEME,
  DEFAULT_THEME_ID,
  THEME_CATALOG,
  findTheme,
  isBuiltInThemeId,
  resolveTheme
} from '@theme/themeCatalog.ts';
export { ThemeId } from '@theme/themeTypes.ts';
export type { ThemeColors, ThemeDefinition, ThemeSource } from '@theme/themeTypes.ts';

/** Current default theme used by static consumers until active theme state lands. */
export const theme = DEFAULT_THEME;
