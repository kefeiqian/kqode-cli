import { createStore } from 'jotai';
import { describe, expect, it, vi } from 'vitest';
import type { BackendClient, ProviderStatusInfo } from '@contracts/backend/index.ts';
import { PROVIDER_STATUS_CONNECTED, PROVIDER_STATUS_NOT_CONFIGURED } from '@contracts/backend/index.ts';
import { backendClientAtom } from '@state/global/index.ts';
import { memoryBackendStub } from '@test/backendMemoryStub.ts';
import { themeBackendStub } from '@test/backendThemeStub.ts';
import {
  activeSurfaceAtom,
  closeActiveSurfaceAtom,
  openLoginSurfaceAtom,
  openModelSurfaceAtom,
  openResumeSurfaceAtom,
  Surface
} from '@state/ui/surface/index.ts';
import { helpVisibleAtom, openHelpAtom } from '@state/ui/help/index.ts';

const provider = (status: ProviderStatusInfo['status']): ProviderStatusInfo => ({
  providerId: `provider-${status}`,
  label: `Provider ${status}`,
  baseUrl: null,
  defaultModel: status === PROVIDER_STATUS_CONNECTED ? 'default-model' : null,
  status,
  credentialSource: status === PROVIDER_STATUS_CONNECTED ? 'keychain' : null
});

const clientWithProviders = (providers: ProviderStatusInfo[]): BackendClient => ({
  ...memoryBackendStub(),
  ...themeBackendStub(),
  submit: vi.fn(),
  onTranscriptEvent: () => () => undefined,
  clearConversation: async () => undefined,
  cancelTurn: async () => undefined,
  gitStatus: async () => null,
  listProviders: async () => ({ providers }),
  getActiveSelection: async () => ({ providerId: null, modelId: null }),
  setActiveSelection: async () => {},
  clearProviderKey: async () => {},
  setProviderKey: async () => ({ outcome: 'unreachable', selectedModel: null }),
  listModels: async () => ({ status: 'failed', models: [] }),
  listSessions: async () => ({ sessions: [] }),
  resumeSession: async () => ({
    sessionId: 'sess-1',
    workspaceCwd: 'C:\\workspace',
    canonicalWorkspaceCwd: 'C:\\workspace',
    turns: []
  })
});

function deferredProviders() {
  let resolve!: (providers: ProviderStatusInfo[]) => void;
  const promise = new Promise<ProviderStatusInfo[]>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}

describe('surface atoms', () => {
  it('starts on home and opens exactly one named surface at a time', () => {
    const store = createStore();

    expect(store.get(activeSurfaceAtom)).toBe(Surface.Home);

    store.set(openLoginSurfaceAtom);
    expect(store.get(activeSurfaceAtom)).toBe(Surface.Login);
    expect(store.get(helpVisibleAtom)).toBe(false);

    store.set(openHelpAtom);
    expect(store.get(activeSurfaceAtom)).toBe(Surface.Help);
    expect(store.get(helpVisibleAtom)).toBe(true);
  });

  it('closes the active surface back to home for Esc handlers', () => {
    const store = createStore();
    store.set(openLoginSurfaceAtom);

    store.set(closeActiveSurfaceAtom);

    expect(store.get(activeSurfaceAtom)).toBe(Surface.Home);
  });

  it('folds the help visible selector into the active surface', () => {
    const store = createStore();

    store.set(helpVisibleAtom, true);
    expect(store.get(activeSurfaceAtom)).toBe(Surface.Help);

    store.set(helpVisibleAtom, false);
    expect(store.get(activeSurfaceAtom)).toBe(Surface.Home);
  });

  it('opens model when a provider is connected', async () => {
    const store = createStore();
    store.set(backendClientAtom, clientWithProviders([provider(PROVIDER_STATUS_CONNECTED)]));

    await store.set(openModelSurfaceAtom);

    expect(store.get(activeSurfaceAtom)).toBe(Surface.Model);
  });

  it('routes model to login when no provider is connected', async () => {
    const store = createStore();
    store.set(backendClientAtom, clientWithProviders([provider(PROVIDER_STATUS_NOT_CONFIGURED)]));

    await store.set(openModelSurfaceAtom);

    expect(store.get(activeSurfaceAtom)).toBe(Surface.Login);
  });

  it('opens resume directly as its own fullscreen surface', () => {
    const store = createStore();

    store.set(openResumeSurfaceAtom);

    expect(store.get(activeSurfaceAtom)).toBe(Surface.Resume);
  });

  it('does not let a stale model status read overwrite newer navigation', async () => {
    const store = createStore();
    const pending = deferredProviders();
    store.set(backendClientAtom, {
      ...clientWithProviders([]),
      listProviders: async () => ({ providers: await pending.promise })
    });

    const openModel = store.set(openModelSurfaceAtom);
    store.set(openLoginSurfaceAtom);
    pending.resolve([provider(PROVIDER_STATUS_CONNECTED)]);
    await openModel;

    expect(store.get(activeSurfaceAtom)).toBe(Surface.Login);
  });
});
