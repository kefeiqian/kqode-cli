import { ThemeId } from '@theme/themeTypes.ts';
import type { ThemeDefinition } from '@theme/themeTypes.ts';

/**
 * Built-in theme preset data (color tokens + source metadata) for the `/theme`
 * picker. Kept as one flat, uniform data table; catalog assembly and id lookup
 * live in `themeCatalog.ts`.
 */
export const THEME_PRESETS = [
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
      inputBackground: '#24283B',
      selectionBackground: '#33467C'
    }
  },
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
      inputBackground: '#44475A',
      selectionBackground: '#414A63'
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
      inputBackground: '#3A3F4B',
      selectionBackground: '#454C59'
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
      inputBackground: '#3B4252',
      selectionBackground: '#434C5E'
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
      inputBackground: '#3C3836',
      selectionBackground: '#4A453F'
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
      inputBackground: '#313244',
      selectionBackground: '#414356'
    }
  },
  {
    id: ThemeId.SolarizedDark,
    label: 'Solarized Dark',
    isDark: true,
    source: {
      name: 'Solarized',
      url: 'https://github.com/altercation/solarized',
      license: 'MIT',
      notice: 'Copyright (c) 2011 Ethan Schoonover'
    },
    colors: {
      terminalBackground: '#002B36',
      bodyBackground: '#002B36',
      foreground: '#839496',
      muted: '#657B83',
      accentBlue: '#3C9DDA',
      accentGreen: '#859900',
      warning: '#B58900',
      errorRed: '#F5645F',
      border: '#073642',
      messageBackground: '#073642',
      inputBackground: '#073642',
      selectionBackground: '#0E4C5C'
    }
  },
  {
    id: ThemeId.Monokai,
    label: 'Monokai',
    isDark: true,
    source: {
      name: 'monokai.nvim (classic Monokai palette)',
      url: 'https://github.com/tanvirtin/monokai.nvim',
      license: 'MIT',
      notice: 'Copyright (c) 2021 Tanvir Islam'
    },
    colors: {
      terminalBackground: '#272822',
      bodyBackground: '#272822',
      foreground: '#F8F8F2',
      muted: '#847E68',
      accentBlue: '#66D9EF',
      accentGreen: '#A6E22E',
      warning: '#E6DB74',
      errorRed: '#FD5B8F',
      border: '#49483E',
      messageBackground: '#3E3D32',
      inputBackground: '#3E3D32',
      selectionBackground: '#49483E'
    }
  },
  {
    id: ThemeId.RosePine,
    label: 'Rosé Pine',
    isDark: true,
    source: {
      name: 'Rosé Pine',
      url: 'https://github.com/rose-pine/palette',
      license: 'MIT',
      notice: 'Copyright (c) mvllow'
    },
    colors: {
      terminalBackground: '#191724',
      bodyBackground: '#191724',
      foreground: '#E0DEF4',
      muted: '#6E6A86',
      accentBlue: '#9CCFD8',
      accentGreen: '#4C97AF',
      warning: '#F6C177',
      errorRed: '#EB6F92',
      border: '#403D52',
      messageBackground: '#1F1D2E',
      inputBackground: '#1F1D2E',
      selectionBackground: '#403D52'
    }
  },
  {
    id: ThemeId.Everforest,
    label: 'Everforest',
    isDark: true,
    source: {
      name: 'Everforest',
      url: 'https://github.com/sainnhe/everforest',
      license: 'MIT',
      notice: 'Copyright (c) 2019 sainnhe'
    },
    colors: {
      terminalBackground: '#2D353B',
      bodyBackground: '#2D353B',
      foreground: '#D3C6AA',
      muted: '#859289',
      accentBlue: '#7FBBB3',
      accentGreen: '#A7C080',
      warning: '#DBBC7F',
      errorRed: '#E67E80',
      border: '#475258',
      messageBackground: '#343F44',
      inputBackground: '#343F44',
      selectionBackground: '#4F585E'
    }
  }
] as const satisfies readonly ThemeDefinition[];

export type BuiltInTheme = (typeof THEME_PRESETS)[number];
