import { ThemeId } from '@theme/themeTypes.ts';
import type { ThemeDefinition } from '@theme/themeTypes.ts';

export const DEFAULT_THEME_ID = ThemeId.Dracula;

export const THEME_CATALOG = [
  {
    id: ThemeId.Dracula,
    label: 'Dracula',
    isDark: true,
    source: {
      name: 'Dracula Theme',
      url: 'https://github.com/dracula/dracula-theme',
      license: 'MIT',
      notice: 'Copyright (c) 2023 Dracula Theme'
    },
    colors: {
      terminalBackground: '#282A36',
      bodyBackground: '#282A36',
      foreground: '#F8F8F2',
      muted: '#6272A4',
      accentBlue: '#8BE9FD',
      accentGreen: '#50FA7B',
      warning: '#F1FA8C',
      errorRed: '#FF5555',
      border: '#44475A',
      messageBackground: '#44475A',
      inputBackground: '#44475A'
    }
  },
  {
    id: ThemeId.OneDark,
    label: 'One Dark',
    isDark: true,
    source: {
      name: 'Atom One Dark Syntax',
      url: 'https://github.com/atom/one-dark-syntax',
      license: 'MIT',
      notice: 'Copyright (c) 2016 GitHub Inc.'
    },
    colors: {
      terminalBackground: '#282C34',
      bodyBackground: '#282C34',
      foreground: '#ABB2BF',
      muted: '#828997',
      accentBlue: '#61AFEF',
      accentGreen: '#98C379',
      warning: '#E5C07B',
      errorRed: '#EF737D',
      border: '#3E4451',
      messageBackground: '#3A3F4B',
      inputBackground: '#3A3F4B'
    }
  },
  {
    id: ThemeId.Nord,
    label: 'Nord',
    isDark: true,
    source: {
      name: 'Nord',
      url: 'https://github.com/nordtheme/nord',
      license: 'MIT',
      notice: 'Copyright (c) 2016-present Sven Greb'
    },
    colors: {
      terminalBackground: '#2E3440',
      bodyBackground: '#2E3440',
      foreground: '#ECEFF4',
      muted: '#81A1C1',
      accentBlue: '#88C0D0',
      accentGreen: '#A3BE8C',
      warning: '#EBCB8B',
      errorRed: '#E78284',
      border: '#4C566A',
      messageBackground: '#3B4252',
      inputBackground: '#3B4252'
    }
  },
  {
    id: ThemeId.GruvboxDark,
    label: 'Gruvbox Dark',
    isDark: true,
    source: {
      name: 'Gruvbox',
      url: 'https://github.com/morhetz/gruvbox',
      license: 'MIT/X11',
      notice: 'Copyright (c) Pavel Pertsev / morhetz'
    },
    colors: {
      terminalBackground: '#282828',
      bodyBackground: '#282828',
      foreground: '#EBDBB2',
      muted: '#A89984',
      accentBlue: '#83A598',
      accentGreen: '#B8BB26',
      warning: '#FABD2F',
      errorRed: '#FF6E7A',
      border: '#504945',
      messageBackground: '#3C3836',
      inputBackground: '#3C3836'
    }
  },
  {
    id: ThemeId.TokyoNight,
    label: 'Tokyo Night',
    isDark: true,
    source: {
      name: 'Tokyo Night VS Code Theme',
      url: 'https://github.com/tokyo-night/tokyo-night-vscode-theme',
      license: 'MIT',
      notice: 'Tokyo Night VS Code Theme contributors'
    },
    colors: {
      terminalBackground: '#1A1B26',
      bodyBackground: '#1A1B26',
      foreground: '#C0CAF5',
      muted: '#A9B1D6',
      accentBlue: '#7DCFFF',
      accentGreen: '#9ECE6A',
      warning: '#E0AF68',
      errorRed: '#F7768E',
      border: '#414868',
      messageBackground: '#24283B',
      inputBackground: '#24283B'
    }
  },
  {
    id: ThemeId.CatppuccinMocha,
    label: 'Catppuccin Mocha',
    isDark: true,
    source: {
      name: 'Catppuccin',
      url: 'https://github.com/catppuccin/catppuccin',
      license: 'MIT',
      notice: 'Copyright (c) 2021 Catppuccin'
    },
    colors: {
      terminalBackground: '#1E1E2E',
      bodyBackground: '#1E1E2E',
      foreground: '#CDD6F4',
      muted: '#9399B2',
      accentBlue: '#89B4FA',
      accentGreen: '#A6E3A1',
      warning: '#F9E2AF',
      errorRed: '#F38BA8',
      border: '#45475A',
      messageBackground: '#313244',
      inputBackground: '#313244'
    }
  }
] as const satisfies readonly ThemeDefinition[];

export type BuiltInTheme = (typeof THEME_CATALOG)[number];

export const DEFAULT_THEME = THEME_CATALOG[0];

export function findTheme(themeId: string): BuiltInTheme | undefined {
  return THEME_CATALOG.find((theme) => theme.id === themeId);
}

export function resolveTheme(themeId: string | null | undefined): BuiltInTheme {
  return themeId === null || themeId === undefined ? DEFAULT_THEME : findTheme(themeId) ?? DEFAULT_THEME;
}

export function isBuiltInThemeId(themeId: string): themeId is ThemeId {
  return findTheme(themeId) !== undefined;
}
