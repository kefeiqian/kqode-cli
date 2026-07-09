import { createStore } from 'jotai';
import { describe, expect, it } from 'vitest';
import type { BackendClient, ProviderStatusInfo, SetKeyParams } from '@contracts/backend/index.ts';
import { memoryBackendStub } from '@test/backendMemoryStub.ts';
import {
  CREDENTIAL_SOURCE_ENV,
  CREDENTIAL_SOURCE_KEYCHAIN,
  PROVIDER_STATUS_CONNECTED,
  PROVIDER_STATUS_NOT_CONFIGURED
} from '@contracts/backend/index.ts';
import {
  NOT_CONFIGURED_HERE_MODEL_LABEL,
  NOT_CONFIGURED_MODEL_LABEL,
  UNRESOLVED_MODEL_LABEL,
  formatModelLabel
} from '@libs/model/index.ts';
import { activeModelLabelAtom, backendClientAtom, refreshActiveModelAtom } from '@state/global/index.ts';

describe('activeModel atoms', () => {
  it('starts hidden (unresolved) before the backend responds', () => {
    const store = createStore();

    expect(store.get(activeModelLabelAtom)).toBe(UNRESOLVED_MODEL_LABEL);
  });

  it('falls back to not configured when the backend client is unavailable', async () => {
    const store = createStore();

    await store.set(refreshActiveModelAtom);

    expect(store.get(activeModelLabelAtom)).toBe(NOT_CONFIGURED_MODEL_LABEL);
  });

  it('resolves a connected provider and active model into a compact label', async () => {
    const store = createStore();
    store.set(
      backendClientAtom,
      clientWith({
        providers: [provider('kimi', 'Kimi')],
        active: { providerId: 'kimi', modelId: 'moonshot-v1' }
      })
    );

    await store.set(refreshActiveModelAtom);

    expect(store.get(activeModelLabelAtom)).toBe(formatModelLabel('Kimi', 'moonshot-v1', CREDENTIAL_SOURCE_KEYCHAIN));
  });

  it('uses the first connected provider default model when the global selection is empty', async () => {
    const store = createStore();
    store.set(
      backendClientAtom,
      clientWith({
        providers: [provider('kimi', 'Kimi', PROVIDER_STATUS_CONNECTED, CREDENTIAL_SOURCE_ENV, 'kimi-k2.7-code')]
      })
    );

    await store.set(refreshActiveModelAtom);

    expect(store.get(activeModelLabelAtom)).toBe(formatModelLabel('Kimi', 'kimi-k2.7-code', CREDENTIAL_SOURCE_ENV));
  });

  it('shows not configured when no connected provider has a default model', async () => {
    const store = createStore();
    store.set(
      backendClientAtom,
      clientWith({
        providers: [
          provider(
            'custom',
            'Custom',
            PROVIDER_STATUS_CONNECTED,
            CREDENTIAL_SOURCE_KEYCHAIN,
            null
          )
        ]
      })
    );

    await store.set(refreshActiveModelAtom);

    expect(store.get(activeModelLabelAtom)).toBe(NOT_CONFIGURED_MODEL_LABEL);
  });

  it('shows not configured when nothing is connected', async () => {
    const store = createStore();
    store.set(
      backendClientAtom,
      clientWith({
        providers: [provider('kimi', 'Kimi', PROVIDER_STATUS_NOT_CONFIGURED)]
      })
    );

    await store.set(refreshActiveModelAtom);

    expect(store.get(activeModelLabelAtom)).toBe(NOT_CONFIGURED_MODEL_LABEL);
  });

  it('shows not configured here when the active provider is not connected in this cwd', async () => {
    const store = createStore();
    store.set(
      backendClientAtom,
      clientWith({
        providers: [provider('kimi', 'Kimi', PROVIDER_STATUS_NOT_CONFIGURED)],
        active: { providerId: 'kimi', modelId: 'moonshot-v1' }
      })
    );

    await store.set(refreshActiveModelAtom);

    expect(store.get(activeModelLabelAtom)).toBe(NOT_CONFIGURED_HERE_MODEL_LABEL);
  });

  it('refreshes to the auto-selected model after a successful login connects a provider', async () => {
    const store = createStore();
    const client = mutableLoginClient();
    store.set(backendClientAtom, client);

    await store.set(refreshActiveModelAtom);
    expect(store.get(activeModelLabelAtom)).toBe(NOT_CONFIGURED_MODEL_LABEL);

    await client.setProviderKey({ providerId: 'kimi', baseUrl: null, label: null, apiKey: 'secret' });
    await store.set(refreshActiveModelAtom);

    expect(store.get(activeModelLabelAtom)).toBe(formatModelLabel('Kimi', 'moonshot-v1', CREDENTIAL_SOURCE_KEYCHAIN));
  });
});

function provider(
  providerId: string,
  label = providerId,
  status: ProviderStatusInfo['status'] = PROVIDER_STATUS_CONNECTED,
  source: ProviderStatusInfo['credentialSource'] = status === PROVIDER_STATUS_CONNECTED ? CREDENTIAL_SOURCE_KEYCHAIN : null,
  defaultModel: string | null = status === PROVIDER_STATUS_CONNECTED ? 'moonshot-v1' : null
): ProviderStatusInfo {
  return {
    providerId,
    label,
    baseUrl: null,
    defaultModel,
    status,
    credentialSource: source
  };
}

function clientWith({
  providers = [],
  active = { providerId: null, modelId: null }
}: {
  providers?: ProviderStatusInfo[];
  active?: Awaited<ReturnType<BackendClient['getActiveSelection']>>;
}): BackendClient {
  return {
    ...memoryBackendStub(),
    submit: async () => undefined,
    onTranscriptEvent: () => () => undefined,
    clearConversation: async () => undefined,
    cancelTurn: async () => undefined,
    gitStatus: async () => null,
    listProviders: async () => ({ providers }),
    getActiveSelection: async () => active,
    setActiveSelection: async () => {},
    clearProviderKey: async () => {},
    setProviderKey: async () => ({ outcome: 'connected', selectedModel: null }),
    listModels: async () => ({ status: 'loaded', models: [] }),
    listSessions: async () => ({ sessions: [] }),
    resumeSession: async () => ({
      sessionId: 'sess-1',
      workspaceCwd: 'C:\\workspace',
      canonicalWorkspaceCwd: 'C:\\workspace',
      turns: []
    })
  };
}

function mutableLoginClient(): BackendClient {
  const connectedProvider = provider('kimi', 'Kimi');
  let providers: ProviderStatusInfo[] = [];
  let active = { providerId: null, modelId: null } as Awaited<ReturnType<BackendClient['getActiveSelection']>>;
  return {
    ...memoryBackendStub(),
    submit: async () => undefined,
    onTranscriptEvent: () => () => undefined,
    clearConversation: async () => undefined,
    cancelTurn: async () => undefined,
    gitStatus: async () => null,
    listProviders: async () => ({ providers }),
    getActiveSelection: async () => active,
    setActiveSelection: async (providerId, modelId) => {
      active = { providerId, modelId };
    },
    clearProviderKey: async () => {},
    setProviderKey: async (params: SetKeyParams) => {
      providers = [connectedProvider];
      active = { providerId: params.providerId, modelId: 'moonshot-v1' };
      return { outcome: 'connected', selectedModel: 'moonshot-v1' };
    },
    listModels: async () => ({ status: 'loaded', models: [] }),
    listSessions: async () => ({ sessions: [] }),
    resumeSession: async () => ({
      sessionId: 'sess-1',
      workspaceCwd: 'C:\\workspace',
      canonicalWorkspaceCwd: 'C:\\workspace',
      turns: []
    })
  };
}
