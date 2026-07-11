/** Stable identifiers for built-in TUI themes. */
export const ThemeId = {
  Dracula: 'dracula',
  OneDark: 'one-dark',
  Nord: 'nord',
  GruvboxDark: 'gruvbox-dark',
  TokyoNight: 'tokyo-night',
  CatppuccinMocha: 'catppuccin-mocha'
} as const;

export type ThemeId = (typeof ThemeId)[keyof typeof ThemeId];

/** Semantic color tokens consumed by the current Ink TUI. */
export type ThemeColors = {
  terminalBackground: string;
  bodyBackground: string;
  foreground: string;
  muted: string;
  accentBlue: string;
  accentGreen: string;
  warning: string;
  errorRed: string;
  border: string;
  messageBackground: string;
  inputBackground: string;
  selectionBackground: string;
};

export type ThemeSource = {
  name: string;
  url: string;
  license: string;
  notice: string;
};

export type ThemeDefinition = {
  id: ThemeId;
  label: string;
  isDark: true;
  colors: ThemeColors;
  source: ThemeSource;
};
