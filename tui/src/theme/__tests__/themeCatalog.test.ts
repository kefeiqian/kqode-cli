import { describe, expect, it } from 'vitest';
import {
  DEFAULT_THEME,
  DEFAULT_THEME_ID,
  THEME_CATALOG,
  ThemeId,
  resolveTheme
} from '@theme/themeConfig.ts';
import { failingContrastChecks } from '@theme/themeContrast.ts';
import type { ThemeColors } from '@theme/themeTypes.ts';

const EXPECTED_IDS = [
  ThemeId.CatppuccinMocha,
  ThemeId.Dracula,
  ThemeId.GruvboxDark,
  ThemeId.Nord,
  ThemeId.OneDark,
  ThemeId.TokyoNight
];

const COLOR_TOKENS: Array<keyof ThemeColors> = [
  'terminalBackground',
  'bodyBackground',
  'foreground',
  'muted',
  'accentBlue',
  'accentGreen',
  'warning',
  'errorRed',
  'border',
  'messageBackground',
  'inputBackground'
];

describe('THEME_CATALOG', () => {
  it('lists the built-in dark themes sorted alphabetically by label', () => {
    expect(THEME_CATALOG.map((theme) => theme.id)).toEqual(EXPECTED_IDS);
    expect(THEME_CATALOG.every((theme) => theme.isDark)).toBe(true);
    const labels = THEME_CATALOG.map((theme) => theme.label);
    expect(labels).toEqual([...labels].sort((left, right) => left.localeCompare(right)));
  });

  it('uses Tokyo Night as the default theme with its tokens', () => {
    expect(DEFAULT_THEME_ID).toBe(ThemeId.TokyoNight);
    expect(DEFAULT_THEME.id).toBe(ThemeId.TokyoNight);
    expect(DEFAULT_THEME.colors.foreground).toBe('#C0CAF5');
    expect(DEFAULT_THEME.colors.muted).toBe('#A9B1D6');
    expect(DEFAULT_THEME.colors.accentBlue).toBe('#7DCFFF');
    expect(DEFAULT_THEME.colors.errorRed).toBe('#F7768E');
    expect(DEFAULT_THEME.colors.messageBackground).toBe('#24283B');
    expect(DEFAULT_THEME.colors.terminalBackground).toBe('#1A1B26');
  });

  it('defines complete truecolor semantic tokens for every preset', () => {
    for (const theme of THEME_CATALOG) {
      expect(Object.keys(theme.colors).sort()).toEqual([...COLOR_TOKENS].sort());
      for (const token of COLOR_TOKENS) {
        expect(theme.colors[token], `${theme.id}.${token}`).toMatch(/^#[0-9A-F]{6}$/i);
      }
    }
  });

  it('passes readability contrast gates for text-bearing tokens', () => {
    for (const theme of THEME_CATALOG) {
      expect(failingContrastChecks(theme), theme.id).toEqual([]);
    }
  });

  it('falls back to the default theme for unknown ids', () => {
    expect(resolveTheme(null)).toBe(DEFAULT_THEME);
    expect(resolveTheme('missing-theme')).toBe(DEFAULT_THEME);
    expect(resolveTheme(ThemeId.Nord).id).toBe(ThemeId.Nord);
  });

  it('records source and license metadata for every preset', () => {
    for (const theme of THEME_CATALOG) {
      expect(theme.source.name.length, theme.id).toBeGreaterThan(0);
      expect(theme.source.url, theme.id).toMatch(/^https:\/\/github\.com\//);
      expect(theme.source.license.length, theme.id).toBeGreaterThan(0);
      expect(theme.source.notice.length, theme.id).toBeGreaterThan(0);
    }
  });
});
