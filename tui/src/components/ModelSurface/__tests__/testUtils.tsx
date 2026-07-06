import { createStore } from 'jotai';
import { vi } from 'vitest';
import { ModelSurface } from '@components/ModelSurface/index.tsx';
import type { BackendClient, ModelListResult, ProviderStatusInfo } from '@contracts/backend/index.ts';
import {
  MODEL_LIST_STATUS_EMPTY,
  PROVIDER_STATUS_CONNECTED,
  PROVIDER_STATUS_NOT_CONFIGURED,
  SET_KEY_OUTCOME_CONNECTED
} from '@contracts/backend/index.ts';
import { backendClientAtom } from '@state/global/index.ts';
import { activeSurfaceAtom, columnsTestOverrideAtom, rowsTestOverrideAtom, Surface } from '@state/ui/index.ts';
import { renderWithJotai } from '@test/renderWithJotai.tsx';

export function provider(providerId: string, label = providerId, connected = true): ProviderStatusInfo {
  return {
    providerId,
    label,
    baseUrl: null,
    status: connected ? PROVIDER_STATUS_CONNECTED : PROVIDER_STATUS_NOT_CONFIGURED,
    credentialSource: connected ? 'keychain' : null
  };
}

export function fakeClient(options: {
  providers: ProviderStatusInfo[];
  active?: { providerId: string | null; modelId: string | null };
  lists?: Record<string, ModelListResult | Promise<ModelListResult>>;
}): BackendClient {
  return {
    submitStreaming: vi.fn(),
    gitStatus: vi.fn(async () => null),
    listProviders: vi.fn(async () => ({ persistenceAvailable: true, providers: options.providers })),
    getActiveSelection: vi.fn(async () => options.active ?? { providerId: null, modelId: null }),
    setActiveSelection: vi.fn(async () => {}),
    clearProviderKey: vi.fn(async () => {}),
    setProviderKey: vi.fn<BackendClient['setProviderKey']>(async () => ({ outcome: SET_KEY_OUTCOME_CONNECTED, selectedModel: null })),
    listModels: vi.fn<BackendClient['listModels']>((providerId: string) => {
      const result = options.lists?.[providerId];
      if (result === undefined) {
        return Promise.resolve({ status: MODEL_LIST_STATUS_EMPTY, models: [] });
      }
      return Promise.resolve(result);
    })
  };
}

export function renderModel(client: BackendClient, rows = 10) {
  const store = createStore();
  store.set(activeSurfaceAtom, Surface.Model);
  store.set(backendClientAtom, client);
  store.set(columnsTestOverrideAtom, 100);
  store.set(rowsTestOverrideAtom, rows);
  return { client, store, ...renderWithJotai(<ModelSurface />, store) };
}

export async function waitForFrame(lastFrame: () => string | undefined, text: string) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const frame = lastFrame() ?? '';
    if (frame.includes(text)) {
      return frame;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`Timed out waiting for ${text}. Last frame:\n${lastFrame() ?? ''}`);
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

export function deferredList() {
  let resolve!: (result: ModelListResult) => void;
  const promise = new Promise<ModelListResult>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}
