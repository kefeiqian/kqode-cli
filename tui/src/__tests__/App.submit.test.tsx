import os from 'node:os';
import path from 'node:path';
import { createStore } from 'jotai';
import { describe, expect, it, vi } from 'vitest';
import { App } from '@/App.tsx';
import type { BackendClient, StreamSubmitParams, TranscriptEvent } from '@contracts/backend/index.ts';
import { SETTLED_KIND_COMPLETED } from '@contracts/backend/index.ts';
import { activeSurfaceAtom, columnsTestOverrideAtom, rowsTestOverrideAtom, Surface } from '@state/ui/index.ts';
import { backendClientAtom, productVersionAtom, workspaceCwdAtom } from '@state/global/index.ts';
import {
  clientOnlyRowsAtom,
  promptQueueAtom,
  restoreComposerDraftAtom,
  transcriptEventAtom
} from '@state/promptQueue/index.ts';
import { flushInput } from '@test/flushInput.ts';
import { renderWithJotai } from '@test/renderWithJotai.tsx';

const workspaceCwd = path.join(os.homedir(), 'Projects', 'dummy-react-app');

function renderApp(backendClient: Partial<BackendClient>, columns = 80, rows = 40) {
  const store = createStore();
  store.set(productVersionAtom, '0.1.0');
  store.set(workspaceCwdAtom, workspaceCwd);
  store.set(columnsTestOverrideAtom, columns);
  store.set(rowsTestOverrideAtom, rows);
  const client: BackendClient = {
    submit: async () => undefined,
    onTranscriptEvent: () => () => {},
    clearConversation: async () => undefined,
    cancelTurn: async () => undefined,
    gitStatus: async () => null,
    listProviders: async () => ({ providers: [] }),
    getActiveSelection: async () => ({ providerId: null, modelId: null }),
    setActiveSelection: async () => undefined,
    clearProviderKey: async () => undefined,
    setProviderKey: async () => ({ outcome: 'unreachable', selectedModel: null }),
    listModels: async () => ({ status: 'failed', models: [] }),
    ...backendClient
  };
  store.set(backendClientAtom, client);
  client.onTranscriptEvent((event) => store.set(transcriptEventAtom, event));
  return { store, ...renderWithJotai(<App />, store) };
}

function eventBackend(reply: (text: string) => string = (text) => `reply: ${text}`) {
  let handler: ((event: TranscriptEvent) => void) | undefined;
  const submit = vi.fn(async ({ turnId, text }: StreamSubmitParams) => {
    handler?.({ type: 'activated', turnId });
    handler?.({ type: 'tokenDelta', turnId, delta: reply(text) });
    handler?.({
      type: 'settled',
      turnId,
      result: {
        kind: SETTLED_KIND_COMPLETED,
        text: reply(text),
        finishReason: 'stop',
        errorKind: null,
        message: null
      }
    });
  });
  return { submit, onTranscriptEvent: (next: (event: TranscriptEvent) => void) => {
    handler = next;
    return () => {
      handler = undefined;
    };
  } };
}

async function waitForFrame(getFrame: () => string | undefined, predicate: (frame: string) => boolean) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const frame = getFrame() ?? '';
    if (predicate(frame)) return frame;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`timed out waiting for frame. Last frame:\n${getFrame() ?? ''}`);
}

async function typePrompt(stdin: { write: (data: string) => void }, text: string): Promise<void> {
  stdin.write(text);
  await flushInput();
  stdin.write('\r');
  await flushInput();
}

describe('App submit and event-fed output', () => {
  it('appends the prompt and mirrors assistant events', async () => {
    const backend = eventBackend();
    const { lastFrame, stdin } = renderApp(backend);

    await typePrompt(stdin, 'hello from tui');

    const frame = await waitForFrame(lastFrame, (output) => output.includes('reply: hello from tui'));
    expect(frame).toContain('❯ hello from tui');
    expect(backend.submit).toHaveBeenCalledWith({ turnId: expect.any(String), text: 'hello from tui' });
  });

  it('escapes terminal-control characters in backend output before rendering', async () => {
    const backend = eventBackend(() => 'evil\u001b[2Jcleared');
    const { lastFrame, stdin } = renderApp(backend, 120, 20);

    await typePrompt(stdin, 'trigger');

    const frame = await waitForFrame(lastFrame, (output) => output.includes('evil\\x1b[2Jcleared'));
    expect(frame).not.toContain('evil\u001b[2J');
  });

  it('does not call the backend for whitespace-only submits', async () => {
    const backend = eventBackend();
    const { stdin } = renderApp(backend);

    await typePrompt(stdin, '   ');

    expect(backend.submit).not.toHaveBeenCalled();
  });

  it('posts an unknown slash command without a backend call', async () => {
    const backend = eventBackend();
    const { lastFrame, stdin, store } = renderApp(backend);

    await typePrompt(stdin, '/nope');

    const frame = await waitForFrame(lastFrame, (output) => output.includes('Unknown command: /nope'));
    expect(backend.submit).not.toHaveBeenCalled();
    expect(store.get(promptQueueAtom)).toEqual([]);
    expect(store.get(clientOnlyRowsAtom)).toHaveLength(1);
  });

  it('renders auth errors and reroutes to login with the prompt restored', async () => {
    let handler: ((event: TranscriptEvent) => void) | undefined;
    const submit = vi.fn(async ({ turnId }: StreamSubmitParams) => {
      handler?.({
        type: 'settled',
        turnId,
        result: { kind: 'error', text: null, finishReason: null, errorKind: 'auth', message: 'bad key' }
      });
    });
    const { stdin, store } = renderApp({
      submit,
      onTranscriptEvent: (next) => {
        handler = next;
        return () => undefined;
      }
    });

    await typePrompt(stdin, 'needs a good key');

    await waitForFrame(
      () => `${store.get(activeSurfaceAtom)}:${store.get(restoreComposerDraftAtom)}`,
      (state) => state === `${Surface.Login}:needs a good key`
    );
    expect(store.get(promptQueueAtom).at(-1)?.result?.text).toContain('bad key');
  });
});
