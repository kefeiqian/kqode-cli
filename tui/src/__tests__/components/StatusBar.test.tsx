import { createStore } from 'jotai';
import { describe, expect, it, vi } from 'vitest';
import { StatusBar } from '@components/StatusBar.tsx';
import type { BackendClient, ProviderStatusInfo } from '@contracts/backend/index.ts';
import {
  PROVIDER_STATUS_CONNECTED,
  PROVIDER_STATUS_NOT_CONFIGURED
} from '@contracts/backend/index.ts';
import {
  NOT_CONFIGURED_HERE_MODEL_LABEL,
  NOT_CONFIGURED_MODEL_LABEL,
  formatModelLabel
} from '@libs/model/index.ts';
import { backendClientAtom } from '@state/global/index.ts';
import { armedActionAtom, columnsTestOverrideAtom } from '@state/ui/index.ts';
import { ArmedAction } from '@constants/ui.ts';
import { renderWithJotai } from '@test/renderWithJotai.tsx';

const makeStore = (): ReturnType<typeof createStore> => {
  const store = createStore();
  store.set(columnsTestOverrideAtom, 80);
  return store;
};

describe('StatusBar', () => {
  it('shows the default hints when nothing is armed', () => {
    const { lastFrame } = renderWithJotai(<StatusBar />, makeStore());
    expect(lastFrame() ?? '').toContain('/ commands');
  });

  it('shows the clear-input hint while Esc is armed', () => {
    const store = makeStore();
    store.set(armedActionAtom, ArmedAction.ClearInput);

    const { lastFrame } = renderWithJotai(<StatusBar />, store);
    expect(lastFrame() ?? '').toContain('esc again to clear input');
  });

  it('shows the exit hint while Ctrl+C is armed', () => {
    const store = makeStore();
    store.set(armedActionAtom, ArmedAction.Exit);

    const { lastFrame } = renderWithJotai(<StatusBar />, store);
    expect(lastFrame() ?? '').toContain('ctrl+c again to exit');
  });

  it('shows the active provider and model when the provider is connected', async () => {
    const store = makeStore();
    store.set(
      backendClientAtom,
      clientWith({
        providers: [provider('kimi', 'Kimi')],
        active: { providerId: 'kimi', modelId: 'moonshot-v1' }
      })
    );

    const { lastFrame } = renderWithJotai(<StatusBar />, store);

    await vi.waitFor(() => {
      expect(lastFrame() ?? '').toContain(formatModelLabel('Kimi', 'moonshot-v1'));
    });
  });

  it('shows not configured when no active selection exists', async () => {
    const store = makeStore();
    store.set(backendClientAtom, clientWith({ providers: [provider('kimi', 'Kimi')] }));

    const { lastFrame } = renderWithJotai(<StatusBar />, store);

    await vi.waitFor(() => {
      const output = lastFrame() ?? '';
      expect(output).toContain(NOT_CONFIGURED_MODEL_LABEL);
    });
  });

  it('shows not configured here when the selected provider is disconnected locally', async () => {
    const store = makeStore();
    store.set(
      backendClientAtom,
      clientWith({
        providers: [provider('kimi', 'Kimi', PROVIDER_STATUS_NOT_CONFIGURED)],
        active: { providerId: 'kimi', modelId: 'moonshot-v1' }
      })
    );

    const { lastFrame } = renderWithJotai(<StatusBar />, store);

    await vi.waitFor(() => {
      expect(lastFrame() ?? '').toContain(NOT_CONFIGURED_HERE_MODEL_LABEL);
    });
  });

  it('keeps long active labels within the status bar columns', async () => {
    const store = makeStore();
    store.set(columnsTestOverrideAtom, 48);
    store.set(
      backendClientAtom,
      clientWith({
        providers: [provider('long', 'Very Long Provider Label')],
        active: { providerId: 'long', modelId: 'very-long-model-id-for-status-bar' }
      })
    );

    const { lastFrame } = renderWithJotai(<StatusBar />, store);

    await vi.waitFor(() => {
      const output = lastFrame() ?? '';
      expect(output).not.toContain(NOT_CONFIGURED_MODEL_LABEL);
      expect(output.split('\n').every((row) => row.length <= 48)).toBe(true);
    });
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
    submitStreaming: async () => ({ kind: 'completed', text: '', finishReason: null }),
    gitStatus: async () => null,
    listProviders: async () => ({ persistenceAvailable: true, providers }),
    getActiveSelection: async () => active,
    setActiveSelection: async () => {},
    clearProviderKey: async () => {},
    setProviderKey: async () => ({ outcome: 'connected', selectedModel: null }),
    listModels: async () => ({ status: 'loaded', models: [] })
  };
}
