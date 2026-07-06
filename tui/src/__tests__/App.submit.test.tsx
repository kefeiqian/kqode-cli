import os from 'node:os';
import path from 'node:path';
import { createStore } from 'jotai';
import { describe, expect, it, vi } from 'vitest';
import { App } from '@/App.tsx';
import { BackendClientError, BackendErrorKind } from '@contracts/backend/index.ts';
import type {
  BackendClient,
  StreamCallbacks,
  StreamOutcome,
  StreamSubmitParams
} from '@contracts/backend/index.ts';
import { columnsTestOverrideAtom, rowsTestOverrideAtom } from '@state/ui/index.ts';
import { backendClientAtom, productVersionAtom, workspaceCwdAtom } from '@state/global/index.ts';
import { promptQueueAtom } from '@state/promptQueue/index.ts';
import { flushInput } from '@test/flushInput.ts';
import { renderWithJotai } from '@test/renderWithJotai.tsx';

const workspaceCwd = path.join(os.homedir(), 'Projects', 'dummy-react-app');

function renderApp(backendClient: Partial<BackendClient>, columns = 80, rows = 40) {
  const store = createStore();
  store.set(productVersionAtom, '0.1.0');
  store.set(workspaceCwdAtom, workspaceCwd);
  store.set(columnsTestOverrideAtom, columns);
  store.set(rowsTestOverrideAtom, rows);
  // Fill the full seam so the after-turn git refresh has a gitStatus to call;
  // streaming tests only supply submitStreaming.
  const client: BackendClient = {
    gitStatus: async () => null,
    listProviders: async () => [],
    getActiveSelection: async () => ({ providerId: null, modelId: null }),
    setActiveSelection: async () => {},
    clearProviderKey: async () => {},
    setProviderKey: async () => ({ outcome: 'unreachable', selectedModel: null }),
    listModels: async () => ({ status: 'failed', models: [] }),
    submitStreaming: async () => {
      throw new Error('submitStreaming not provided');
    },
    ...backendClient
  };
  store.set(backendClientAtom, client);
  return { store, ...renderWithJotai(<App />, store) };
}

// A fake backend that streams a canned reply (default: echoes the prompt with a
// prefix so the assistant text is distinguishable from the echoed prompt row).
function streamingBackend(reply: (text: string) => string = (text) => `reply: ${text}`) {
  return vi.fn(
    async ({ text }: StreamSubmitParams, { onDelta }: StreamCallbacks): Promise<StreamOutcome> => {
      const output = reply(text);
      onDelta(output);
      return { kind: 'completed', text: output, finishReason: 'stop' };
    }
  );
}

async function waitForFrame(
  getFrame: () => string | undefined,
  predicate: (frame: string) => boolean
): Promise<string> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const frame = getFrame() ?? '';
    if (predicate(frame)) {
      return frame;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`timed out waiting for frame. Last frame:\n${getFrame() ?? ''}`);
}

async function submit(stdin: { write: (data: string) => void }, text: string): Promise<void> {
  stdin.write(text);
  await flushInput();
  stdin.write('\r');
  await flushInput();
}

describe('App submit and streaming output', () => {
  it('appends the prompt and streams the assistant reply when Enter is pressed', async () => {
    const submitStreaming = streamingBackend();
    const { lastFrame, stdin } = renderApp({ submitStreaming });

    await submit(stdin, 'hello from tui');

    const frame = await waitForFrame(lastFrame, (output) =>
      output.includes('reply: hello from tui')
    );
    expect(frame).toContain('❯ hello from tui');
    expect(submitStreaming).toHaveBeenCalledWith(
      { text: 'hello from tui' },
      expect.objectContaining({ onDelta: expect.any(Function) })
    );
  });

  it('preserves Unicode and surrounding spaces in the backend result', async () => {
    const submitStreaming = streamingBackend();
    const { lastFrame, stdin } = renderApp({ submitStreaming }, 120);

    await submit(stdin, ' café ☕ ');

    await waitForFrame(lastFrame, (output) => output.includes('café ☕'));
    expect(submitStreaming).toHaveBeenCalledWith(
      { text: ' café ☕ ' },
      expect.objectContaining({ onDelta: expect.any(Function) })
    );
  });

  it('queues consecutive submits, marking only the later prompts pending', async () => {
    const pending: Array<{ text: string; resolve: (outcome: StreamOutcome) => void }> = [];
    const submitStreaming = vi.fn(
      (params: StreamSubmitParams): Promise<StreamOutcome> =>
        new Promise((resolve) => {
          pending.push({ text: params.text, resolve });
        })
    );
    const { lastFrame, stdin } = renderApp({ submitStreaming });

    await submit(stdin, 'first');
    await submit(stdin, 'second');
    await submit(stdin, 'third');

    const queuedFrame = await waitForFrame(
      lastFrame,
      (output) => output.includes('second (pending)') && output.includes('third (pending)')
    );
    expect(submitStreaming).toHaveBeenCalledTimes(1);
    expect(submitStreaming).toHaveBeenNthCalledWith(
      1,
      { text: 'first' },
      expect.objectContaining({ onDelta: expect.any(Function) })
    );
    expect(queuedFrame).toContain('❯ first');
    expect(queuedFrame).not.toContain('first (pending)');

    pending[0]?.resolve({ kind: 'completed', text: 'first reply', finishReason: 'stop' });

    const drainedFrame = await waitForFrame(
      lastFrame,
      (output) => output.includes('first reply') && !output.includes('second (pending)')
    );
    expect(submitStreaming).toHaveBeenCalledTimes(2);
    expect(submitStreaming).toHaveBeenNthCalledWith(
      2,
      { text: 'second' },
      expect.objectContaining({ onDelta: expect.any(Function) })
    );
    expect(drainedFrame).toContain('third (pending)');
  });

  it('shows a red backend failure for the matching prompt', async () => {
    const submitStreaming = vi.fn(async (): Promise<StreamOutcome> => {
      throw new BackendClientError(BackendErrorKind.Transport, 'connection died');
    });
    const { lastFrame, stdin } = renderApp({ submitStreaming });

    await submit(stdin, 'will fail');

    const frame = await waitForFrame(lastFrame, (output) =>
      output.includes('ERROR: Rust backend failed')
    );
    expect(frame).toContain('❯ will fail');
    expect(frame).toContain('connection died');
  });

  it('escapes terminal-control characters in backend output before rendering', async () => {
    const submitStreaming = streamingBackend(() => 'evil\u001b[2Jcleared');
    const { lastFrame, stdin } = renderApp({ submitStreaming }, 120, 20);

    await submit(stdin, 'trigger');

    const frame = await waitForFrame(lastFrame, (output) => output.includes('evil\\x1b[2Jcleared'));
    expect(frame).not.toContain('evil\u001b[2J');
  });

  it('does not call the backend for whitespace-only submits', async () => {
    const submitStreaming = streamingBackend();
    const { stdin } = renderApp({ submitStreaming });

    await submit(stdin, '   ');
    await flushInput();

    expect(submitStreaming).not.toHaveBeenCalled();
  });

  it('posts an unknown slash command and its error into the body without a backend call', async () => {
    const submitStreaming = streamingBackend();
    const { lastFrame, stdin, store } = renderApp({ submitStreaming });

    await submit(stdin, '/nope');

    const frame = await waitForFrame(lastFrame, (output) =>
      output.includes('Unknown command: /nope')
    );
    expect(frame).toContain('❯ /nope');
    expect(submitStreaming).not.toHaveBeenCalled();
    expect(store.get(promptQueueAtom).some((item) => item.state === 'active')).toBe(false);
  });

  it('renders a themed provider error when the streamed turn fails', async () => {
    const submitStreaming = vi.fn(
      async (): Promise<StreamOutcome> => ({
        kind: 'error',
        errorKind: 'auth',
        message: 'Kimi rejected the API key'
      })
    );
    const { lastFrame, stdin } = renderApp({ submitStreaming });

    await submit(stdin, 'needs a good key');

    const frame = await waitForFrame(lastFrame, (output) =>
      output.includes('Kimi rejected the API key')
    );
    expect(frame).toContain('❯ needs a good key');
    expect(frame).toContain('ERROR:');
  });

  it('routes to configuration guidance when no key is set', async () => {
    const submitStreaming = vi.fn(
      async (): Promise<StreamOutcome> => ({ kind: 'needsConfiguration' })
    );
    const { lastFrame, stdin } = renderApp({ submitStreaming });

    await submit(stdin, 'hello');

    await waitForFrame(lastFrame, (output) => output.includes('No Kimi API key configured.'));
  });
});
