import { describe, expect, it, vi } from 'vitest';
import { createStore } from 'jotai';

const { mockSetTerminalBackground } = vi.hoisted(() => ({
  mockSetTerminalBackground: vi.fn()
}));

vi.mock('@libs/terminal/terminalBackground.ts', () => ({
  setTerminalBackground: mockSetTerminalBackground
}));

import { activeThemeAtom, applyThemeAtom } from '@state/global/theme.ts';
import { DEFAULT_THEME, ThemeId, findTheme } from '@theme/themeConfig.ts';

describe('active theme state', () => {
  it('defaults to the default preset', () => {
    const store = createStore();
    expect(store.get(activeThemeAtom)).toBe(DEFAULT_THEME);
  });

  it('applies a theme by updating state and the terminal background together', () => {
    const store = createStore();
    const nord = findTheme(ThemeId.Nord);
    if (nord === undefined) {
      throw new Error('expected the Nord preset to exist');
    }

    store.set(applyThemeAtom, nord);

    expect(store.get(activeThemeAtom)).toBe(nord);
    expect(mockSetTerminalBackground).toHaveBeenCalledWith(nord.colors.terminalBackground);
  });
});
