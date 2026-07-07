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
  ThemeId.Dracula,
  ThemeId.OneDark,
  ThemeId.Nord,
  ThemeId.GruvboxDark,
  ThemeId.TokyoNight,
  ThemeId.CatppuccinMocha
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
  it('ships the v1 built-in dark theme list in stable order', () => {
    expect(THEME_CATALOG.map((theme) => theme.id)).toEqual(EXPECTED_IDS);
    expect(THEME_CATALOG.every((theme) => theme.isDark)).toBe(true);
  });

  it('keeps Dracula as the default theme with the existing tokens', () => {
    expect(DEFAULT_THEME_ID).toBe(ThemeId.Dracula);
    expect(DEFAULT_THEME).toBe(THEME_CATALOG[0]);
    expect(DEFAULT_THEME.colors.foreground).toBe('#F8F8F2');
    expect(DEFAULT_THEME.colors.muted).toBe('#6272A4');
    expect(DEFAULT_THEME.colors.accentBlue).toBe('#8BE9FD');
    expect(DEFAULT_THEME.colors.errorRed).toBe('#FF5555');
    expect(DEFAULT_THEME.colors.messageBackground).toBe('#44475A');
    expect(DEFAULT_THEME.colors.terminalBackground).toBe('#282A36');
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
