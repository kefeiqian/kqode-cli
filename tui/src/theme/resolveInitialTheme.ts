import { DEFAULT_THEME, resolveTheme } from '@theme/themeConfig.ts';
import type { ThemeDefinition } from '@theme/themeConfig.ts';
import type { ThemeGetResult } from '@contracts/backend/index.ts';

/** Minimal backend seam the initial theme read needs. */
type ThemeReader = {
  getTheme(): Promise<ThemeGetResult>;
};

/**
 * Resolves the theme to seed before the first frame.
 *
 * Returns the saved preset when the bounded read succeeds, else the default. A
 * read that rejects, exceeds `deadlineMs`, or returns an unset/unknown id all
 * fall back to the default preset (via {@link resolveTheme}), so the opening
 * frame never blocks on backend startup and an unknown stored id is never
 * rewritten here.
 */
export async function resolveInitialTheme(
  client: ThemeReader,
  deadlineMs: number
): Promise<ThemeDefinition> {
  const read = client.getTheme();
  // Handle a late rejection (after the deadline already won) so it cannot
  // surface as an unhandled rejection once we have fallen back to the default.
  read.catch(() => undefined);
  try {
    const { themeId } = await withDeadline(read, deadlineMs);
    return resolveTheme(themeId);
  } catch {
    return DEFAULT_THEME;
  }
}

function withDeadline<T>(promise: Promise<T>, deadlineMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error('initial theme read deadline exceeded')),
      deadlineMs
    );
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}
