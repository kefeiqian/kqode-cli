import { createStore } from 'jotai';
import { describe, expect, it, vi } from 'vitest';
import { StatusBar } from '@components/StatusBar.tsx';
import { memoryBackendStub } from '@test/backendMemoryStub.ts';
import { themeBackendStub } from '@test/backendThemeStub.ts';
import type { BackendClient, ProviderStatusInfo } from '@contracts/backend/index.ts';
import {
  CREDENTIAL_SOURCE_KEYCHAIN,
  PROVIDER_STATUS_CONNECTED,
  PROVIDER_STATUS_NOT_CONFIGURED
} from '@contracts/backend/index.ts';
import {
  NOT_CONFIGURED_HERE_MODEL_LABEL,
  NOT_CONFIGURED_MODEL_LABEL,
  formatModelLabel
} from '@libs/model/index.ts';
import { backendClientAtom } from '@state/global/index.ts';
import {
  armedActionAtom,
  BACKEND_LOADING_HINT,
  columnsTestOverrideAtom,
  copyModeActiveAtom,
  loadingFrameAtom,
  setTransientStatusHintAtom,
  startupStatusHintAtom
} from '@state/ui/index.ts';
import { ArmedAction, COPY_MODE_HINT } from '@constants/ui.ts';
import { renderWithJotai } from '@test/renderWithJotai.tsx';

const cwd = 'C:\\workspace';

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

  it('shows the Copy Mode banner ahead of transient hints without adding a row', () => {
    const store = makeStore();
    store.set(copyModeActiveAtom, true);
    store.set(setTransientStatusHintAtom, { text: 'copied' });

    const { lastFrame } = renderWithJotai(<StatusBar />, store);
    const output = lastFrame() ?? '';

    expect(output).toContain(COPY_MODE_HINT);
    expect(output).not.toContain('copied');
    expect(output.split('\n')).toHaveLength(1);
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
      expect(lastFrame() ?? '').toContain(formatModelLabel('Kimi', 'moonshot-v1', CREDENTIAL_SOURCE_KEYCHAIN));
    });
  });

  it('shows the effective default model when no active selection exists', async () => {
    const store = makeStore();
    store.set(backendClientAtom, clientWith({ providers: [provider('kimi', 'Kimi')] }));

    const { lastFrame } = renderWithJotai(<StatusBar />, store);

    await vi.waitFor(() => {
      const output = lastFrame() ?? '';
      expect(output).toContain(formatModelLabel('Kimi', 'moonshot-v1', CREDENTIAL_SOURCE_KEYCHAIN));
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

  it('hides the model label while the backend is still loading', async () => {
    const store = makeStore();
    store.set(startupStatusHintAtom, BACKEND_LOADING_HINT);
    // A backend request only resolves once the process is ready, so while it
    // loads the label must stay hidden rather than flashing "not configured".
    store.set(backendClientAtom, pendingClient());

    const { lastFrame } = renderWithJotai(<StatusBar />, store);
    await Promise.resolve();

    const output = lastFrame() ?? '';
    expect(output).toContain(BACKEND_LOADING_HINT.text);
    expect(output).not.toContain(NOT_CONFIGURED_MODEL_LABEL);
  });

  it('renders the loading dots from the shared loadingFrameAtom', () => {
    // The composer subscribes to this same atom to re-assert the terminal caret
    // on each spinner frame; the status bar must keep deriving its dots from it.
    const store = makeStore();
    store.set(startupStatusHintAtom, BACKEND_LOADING_HINT);
    store.set(loadingFrameAtom, 2);

    const { lastFrame } = renderWithJotai(<StatusBar />, store);

    expect(lastFrame() ?? '').toContain(`${BACKEND_LOADING_HINT.text}..`);
  });
});

function pendingClient(): BackendClient {
  const never = <T,>(): Promise<T> => new Promise<T>(() => undefined);
  return {
    ...memoryBackendStub(),
    ...themeBackendStub(),
    submit: async () => undefined,
    onTranscriptEvent: () => () => undefined,
    clearConversation: async () => undefined,
    cancelTurn: async () => undefined,
    gitStatus: async () => null,
    listProviders: never,
    getActiveSelection: never,
    setActiveSelection: async () => {},
    clearProviderKey: async () => {},
    setProviderKey: async () => ({ outcome: 'connected', selectedModel: null }),
    listModels: async () => ({ status: 'loaded', models: [] }),
    listSessions: async () => ({ sessions: [] }),
    resumeSession: async () => ({
      sessionId: 'sess-1',
      workspaceCwd: cwd,
      canonicalWorkspaceCwd: cwd,
      turns: []
    })
  };
}

function provider(
  providerId: string,
  label = providerId,
  status: ProviderStatusInfo['status'] = PROVIDER_STATUS_CONNECTED
): ProviderStatusInfo {
  return {
    providerId,
    label,
    baseUrl: null,
    defaultModel: status === PROVIDER_STATUS_CONNECTED ? 'moonshot-v1' : null,
    status,
    credentialSource: status === PROVIDER_STATUS_CONNECTED ? CREDENTIAL_SOURCE_KEYCHAIN : null
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
    ...themeBackendStub(),
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
      workspaceCwd: cwd,
      canonicalWorkspaceCwd: cwd,
      turns: []
    })
  };
}
