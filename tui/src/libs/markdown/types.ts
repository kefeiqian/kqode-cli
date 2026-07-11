import type { ThemeColors } from '@theme/themeConfig.ts';

/** Semantic color token shared by theme-free markdown render structures. */
export type ThemeColorToken = keyof ThemeColors;

/** A styled text run in a markdown-rendered transcript row. */
export type StyledSegment = {
  backgroundColorToken?: ThemeColorToken;
  bold?: boolean;
  colorToken?: ThemeColorToken;
  dimColor?: boolean;
  href?: string;
  italic?: boolean;
  text: string;
  underline?: boolean;
};

/** A styled text run after theme tokens have been resolved for Ink rendering. */
export type RenderedStyledSegment = Omit<
  StyledSegment,
  'backgroundColorToken' | 'colorToken'
> & {
  backgroundColor?: string;
  color?: string;
};

/** One theme-free markdown content row before assistant markers are applied. */
export type MarkdownContentRow = {
  backgroundColorToken?: ThemeColorToken;
  colorToken?: ThemeColorToken;
  /** Soft-wrap rejoin separator (see `BodyRow.continuesPrevious`): `''` mid-word, `' '` word-wrap. */
  continuesPrevious?: string;
  fillColumns?: boolean;
  segments?: StyledSegment[];
  text: string;
};
