import { createStore } from 'jotai';
import { describe, expect, it } from 'vitest';
import type { BackendClient, ProviderStatusInfo, SetKeyParams } from '@contracts/backend/index.ts';
import {
  PROVIDER_STATUS_CONNECTED,
  PROVIDER_STATUS_NOT_CONFIGURED
} from '@contracts/backend/index.ts';
import {
  NOT_CONFIGURED_HERE_MODEL_LABEL,
  NOT_CONFIGURED_MODEL_LABEL,
  formatModelLabel
} from '@libs/model/index.ts';
import { activeModelLabelAtom, backendClientAtom, refreshActiveModelAtom } from '@state/global/index.ts';

describe('activeModel atoms', () => {
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

    expect(store.get(activeModelLabelAtom)).toBe(formatModelLabel('Kimi', 'moonshot-v1'));
  });

  it('shows not configured when the global selection is empty', async () => {
    const store = createStore();
    store.set(backendClientAtom, clientWith({ providers: [provider('kimi', 'Kimi')] }));

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

    expect(store.get(activeModelLabelAtom)).toBe(formatModelLabel('Kimi', 'moonshot-v1'));
  });
});

function provider(
  providerId: string,
  label = providerId,
  status: ProviderStatusInfo['status'] = PROVIDER_STATUS_CONNECTED
): ProviderStatusInfo {
  return {
    providerId,
    label,
    baseUrl: null,
    status,
    credentialSource: status === PROVIDER_STATUS_CONNECTED ? 'keychain' : null
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
    submit: async () => undefined,
    onTranscriptEvent: () => () => undefined,
    clearConversation: async () => undefined,
    cancelTurn: async () => undefined,
    gitStatus: async () => null,
    listProviders: async () => ({ persistenceAvailable: true, providers }),
    getActiveSelection: async () => active,
    setActiveSelection: async () => {},
    clearProviderKey: async () => {},
    setProviderKey: async () => ({ outcome: 'connected', selectedModel: null }),
    listModels: async () => ({ status: 'loaded', models: [] })
  };
}

function mutableLoginClient(): BackendClient {
  const connectedProvider = provider('kimi', 'Kimi');
  let providers: ProviderStatusInfo[] = [];
  let active = { providerId: null, modelId: null } as Awaited<ReturnType<BackendClient['getActiveSelection']>>;
  return {
    submit: async () => undefined,
    onTranscriptEvent: () => () => undefined,
    clearConversation: async () => undefined,
    cancelTurn: async () => undefined,
    gitStatus: async () => null,
    listProviders: async () => ({ persistenceAvailable: true, providers }),
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
    listModels: async () => ({ status: 'loaded', models: [] })
  };
}
