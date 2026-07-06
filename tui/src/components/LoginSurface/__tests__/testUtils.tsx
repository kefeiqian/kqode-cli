import { createStore } from 'jotai';
import { vi } from 'vitest';
import { LoginSurface } from '@components/LoginSurface/index.tsx';
import type { BackendClient, ProviderStatusInfo, SetKeyOutcome } from '@contracts/backend/index.ts';
import {
  MODEL_LIST_STATUS_LOADED,
  PROVIDER_STATUS_CONNECTED,
  PROVIDER_STATUS_NOT_CONFIGURED,
  SET_KEY_OUTCOME_CONNECTED
} from '@contracts/backend/index.ts';
import { backendClientAtom, workspaceCwdAtom } from '@state/global/index.ts';
import { activeSurfaceAtom, columnsTestOverrideAtom, rowsTestOverrideAtom, Surface } from '@state/ui/index.ts';
import { PROVIDER_ID_CUSTOM, PROVIDER_ID_KIMI } from '@state/ui/login/index.ts';
import { renderWithJotai } from '@test/renderWithJotai.tsx';

export const cwd = 'C:\\repo';

export function provider(
  providerId: string,
  label: string,
  status: ProviderStatusInfo['status'],
  source: ProviderStatusInfo['credentialSource'] = null
): ProviderStatusInfo {
  return {
    providerId,
    label,
    baseUrl:
      providerId === PROVIDER_ID_CUSTOM && status === PROVIDER_STATUS_CONNECTED
        ? 'https://api.old.test/v1'
        : null,
    status,
    credentialSource: source
  };
}

export function fakeClient(options: {
  providers?: ProviderStatusInfo[][];
  persistenceAvailable?: boolean;
  outcome?: SetKeyOutcome;
} = {}): BackendClient {
  const providerBatches = options.providers ?? [
    [
      provider(PROVIDER_ID_KIMI, 'Kimi', PROVIDER_STATUS_NOT_CONFIGURED),
      provider(PROVIDER_ID_CUSTOM, 'Custom', PROVIDER_STATUS_NOT_CONFIGURED)
    ]
  ];
  let listIndex = 0;
  return {
    submit: vi.fn(),
    onTranscriptEvent: () => () => undefined,
    clearConversation: async () => undefined,
    cancelTurn: async () => undefined,
    gitStatus: vi.fn(async () => null),
    listProviders: vi.fn(async () => ({
      persistenceAvailable: options.persistenceAvailable ?? true,
      providers: providerBatches[Math.min(listIndex++, providerBatches.length - 1)] ?? []
    })),
    getActiveSelection: vi.fn(async () => ({ providerId: null, modelId: null })),
    setActiveSelection: vi.fn(async () => {}),
    clearProviderKey: vi.fn(async () => {}),
    setProviderKey: vi.fn(async () => ({
      outcome: options.outcome ?? SET_KEY_OUTCOME_CONNECTED,
      selectedModel: 'kimi-k2.7-code'
    })),
    listModels: vi.fn<BackendClient['listModels']>(async () => ({
      status: MODEL_LIST_STATUS_LOADED,
      models: []
    }))
  };
}

export function renderLogin(client: BackendClient = fakeClient()) {
  const store = createStore();
  store.set(activeSurfaceAtom, Surface.Login);
  store.set(backendClientAtom, client);
  store.set(workspaceCwdAtom, cwd);
  store.set(columnsTestOverrideAtom, 100);
  store.set(rowsTestOverrideAtom, 24);
  return { client, store, ...renderWithJotai(<LoginSurface />, store) };
}

export async function waitForFrame(lastFrame: () => string | undefined, text: string) {
  for (let attempt = 0; attempt < 400; attempt += 1) {
    const frame = lastFrame() ?? '';
    if (frame.includes(text)) {
      return frame;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for ${text}. Last frame:\n${lastFrame() ?? ''}`);
}

export async function waitUntil(predicate: () => boolean, label: string) {
  for (let attempt = 0; attempt < 400; attempt += 1) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for ${label}`);
}
