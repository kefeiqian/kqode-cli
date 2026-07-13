import { createStore } from 'jotai';
import { vi } from 'vitest';
import { ThemeSurface } from '@components/ThemeSurface/index.tsx';
import type { BackendClient, ThemeSetResult } from '@contracts/backend/index.ts';
import {
  MODEL_LIST_STATUS_EMPTY,
  SET_KEY_OUTCOME_CONNECTED,
  THEME_SET_OUTCOME_SAVED
} from '@contracts/backend/index.ts';
import { activeThemeAtom, backendClientAtom } from '@state/global/index.ts';
import {
  activeSurfaceAtom,
  columnsTestOverrideAtom,
  rowsTestOverrideAtom,
  Surface
} from '@state/ui/index.ts';
import { memoryBackendStub } from '@test/backendMemoryStub.ts';
import { themeBackendStub } from '@test/backendThemeStub.ts';
import { renderWithJotai } from '@test/renderWithJotai.tsx';
import type { ThemeDefinition } from '@theme/themeConfig.ts';

export const ARROW_DOWN = '\u001B[B';
export const ARROW_UP = '\u001B[A';
export const ENTER = '\r';

/** A full no-op BackendClient; theme tests override only `setTheme`. */
export function baseClient(): BackendClient {
  return {
    ...memoryBackendStub(),
    ...themeBackendStub(),
    submit: vi.fn(),
    onTranscriptEvent: () => () => undefined,
    clearConversation: vi.fn(async () => undefined),
    cancelTurn: vi.fn(async () => undefined),
    stopTurn: vi.fn(async () => undefined),
    gitStatus: vi.fn(async () => null),
    listProviders: vi.fn(async () => ({ providers: [] })),
    getActiveSelection: vi.fn(async () => ({ providerId: null, modelId: null })),
    setActiveSelection: vi.fn(async () => undefined),
    clearProviderKey: vi.fn(async () => undefined),
    setProviderKey: vi.fn<BackendClient['setProviderKey']>(async () => ({
      outcome: SET_KEY_OUTCOME_CONNECTED,
      selectedModel: null
    })),
    listModels: vi.fn<BackendClient['listModels']>(async () => ({
      status: MODEL_LIST_STATUS_EMPTY,
      models: []
    })),
    listSessions: vi.fn<BackendClient['listSessions']>(async () => ({ sessions: [] })),
    resumeSession: vi.fn<BackendClient['resumeSession']>(async () => ({
      sessionId: 's',
      workspaceCwd: '',
      canonicalWorkspaceCwd: '',
      turns: []
    }))
  };
}

/** A client whose `setTheme` is the given mock (default: a saved outcome). */
export function clientWithSetTheme(
  setTheme: BackendClient['setTheme'] = vi.fn<BackendClient['setTheme']>(async () => ({
    outcome: THEME_SET_OUTCOME_SAVED
  }))
): BackendClient {
  return { ...baseClient(), setTheme };
}

/** A `setTheme` whose results are resolved manually, to test out-of-order saves. */
export function deferredSetTheme() {
  const resolvers: Array<(result: ThemeSetResult) => void> = [];
  const setTheme = vi.fn<BackendClient['setTheme']>(
    () => new Promise<ThemeSetResult>((resolve) => resolvers.push(resolve))
  );
  return {
    setTheme,
    resolve: (index: number, result: ThemeSetResult) => resolvers[index]?.(result)
  };
}

export function renderTheme(
  client: BackendClient | undefined,
  options: { active?: ThemeDefinition; rows?: number } = {}
) {
  const store = createStore();
  store.set(activeSurfaceAtom, Surface.Theme);
  store.set(columnsTestOverrideAtom, 100);
  store.set(rowsTestOverrideAtom, options.rows ?? 20);
  if (options.active !== undefined) {
    store.set(activeThemeAtom, options.active);
  }
  if (client !== undefined) {
    store.set(backendClientAtom, client);
  }
  return { store, client, ...renderWithJotai(<ThemeSurface />, store) };
}

export async function waitUntil(predicate: () => boolean, label: string) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`Timed out waiting for ${label}`);
}
