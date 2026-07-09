import { vi } from 'vitest';
import type { BackendClient } from '@contracts/backend/index.ts';
import { THEME_SET_OUTCOME_SAVED } from '@contracts/backend/index.ts';

/** The theme-preference subset of {@link BackendClient}. */
type ThemeBackendMethods = Pick<BackendClient, 'getTheme' | 'setTheme'>;

/**
 * Default no-op theme methods for test fakes that don't exercise `/theme`.
 * Spread into a fake `BackendClient` so it satisfies the full contract; tests
 * that need specific behavior override individual methods after the spread.
 */
export function themeBackendStub(): ThemeBackendMethods {
  return {
    getTheme: vi.fn<BackendClient['getTheme']>(async () => ({ themeId: null })),
    setTheme: vi.fn<BackendClient['setTheme']>(async () => ({ outcome: THEME_SET_OUTCOME_SAVED }))
  };
}
