import type { ThemeDefinition } from '@theme/themeTypes.ts';

export const MINIMUM_TEXT_CONTRAST = 4.5;
export const MINIMUM_MUTED_TEXT_CONTRAST = 3;

export type ContrastCheck = {
  token: string;
  foreground: string;
  background: string;
  ratio: number;
  minimum: number;
};

export function contrastRatio(foreground: string, background: string): number {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

export function contrastChecksForTheme(theme: ThemeDefinition): ContrastCheck[] {
  const background = theme.colors.bodyBackground;
  return [
    requiredCheck('foreground', theme.colors.foreground, background),
    requiredCheck('accentBlue', theme.colors.accentBlue, background),
    requiredCheck('accentGreen', theme.colors.accentGreen, background),
    requiredCheck('warning', theme.colors.warning, background),
    requiredCheck('errorRed', theme.colors.errorRed, background),
    {
      token: 'muted',
      foreground: theme.colors.muted,
      background,
      ratio: contrastRatio(theme.colors.muted, background),
      minimum: MINIMUM_MUTED_TEXT_CONTRAST
    }
  ];
}

export function failingContrastChecks(theme: ThemeDefinition): ContrastCheck[] {
  return contrastChecksForTheme(theme).filter((check) => check.ratio < check.minimum);
}

function requiredCheck(token: string, foreground: string, background: string): ContrastCheck {
  return {
    token,
    foreground,
    background,
    ratio: contrastRatio(foreground, background),
    minimum: MINIMUM_TEXT_CONTRAST
  };
}

function relativeLuminance(hex: string): number {
  const { r, g, b } = parseHexColor(hex);
  const channels = [r, g, b].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function parseHexColor(hex: string): { r: number; g: number; b: number } {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) {
    throw new Error(`expected #RRGGBB color, got ${hex}`);
  }
  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16)
  };
}
