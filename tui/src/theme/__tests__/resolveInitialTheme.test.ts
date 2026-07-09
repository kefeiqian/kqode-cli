import { describe, expect, it, vi } from 'vitest';
import { resolveInitialTheme } from '@theme/resolveInitialTheme.ts';
import { DEFAULT_THEME, ThemeId, findTheme } from '@theme/themeConfig.ts';
import type { ThemeGetResult } from '@contracts/backend/index.ts';

function reader(impl: () => Promise<ThemeGetResult>) {
  return { getTheme: vi.fn(impl) };
}

describe('resolveInitialTheme', () => {
  it('returns the saved preset for a known id', async () => {
    const nord = findTheme(ThemeId.Nord);
    const theme = await resolveInitialTheme(
      reader(async () => ({ themeId: ThemeId.Nord })),
      1_000
    );
    expect(theme).toBe(nord);
  });

  it('falls back to the default theme when no preference is stored', async () => {
    const theme = await resolveInitialTheme(reader(async () => ({ themeId: null })), 1_000);
    expect(theme).toBe(DEFAULT_THEME);
  });

  it('falls back to the default for an unknown id and never writes it back', async () => {
    const getTheme = vi.fn(async () => ({ themeId: 'no-such-theme' }));
    const theme = await resolveInitialTheme({ getTheme }, 1_000);
    expect(theme).toBe(DEFAULT_THEME);
    expect(getTheme).toHaveBeenCalledTimes(1);
  });

  it('falls back to the default when the read rejects', async () => {
    const theme = await resolveInitialTheme(
      reader(async () => {
        throw new Error('backend dead');
      }),
      1_000
    );
    expect(theme).toBe(DEFAULT_THEME);
  });

  it('falls back to the default when the read exceeds the deadline', async () => {
    // A never-resolving read simulates a slow (cold-building) backend start.
    const theme = await resolveInitialTheme(
      reader(() => new Promise<ThemeGetResult>(() => undefined)),
      20
    );
    expect(theme).toBe(DEFAULT_THEME);
  });
});
