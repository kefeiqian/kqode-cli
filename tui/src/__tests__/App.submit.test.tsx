import os from 'node:os';
import path from 'node:path';
import { createStore } from 'jotai';
import { describe, expect, it, vi } from 'vitest';
import { App } from '@/App.tsx';
import { BackendClientError, BackendErrorKind } from '@contracts/backend/index.ts';
import type { BackendClient, SubmitOutcome, SubmitParams } from '@contracts/backend/index.ts';
import { columnsTestOverrideAtom, rowsTestOverrideAtom } from '@state/ui/index.ts';
import { backendClientAtom, productVersionAtom, workspaceCwdAtom } from '@state/global/index.ts';
import { promptQueueAtom } from '@state/promptQueue/index.ts';
import { NEEDS_CONFIGURATION_MESSAGE } from '@libs/promptQueue/promptQueue.ts';
import { flushInput } from '@test/flushInput.ts';
import { renderWithJotai } from '@test/renderWithJotai.tsx';

const workspaceCwd = path.join(os.homedir(), 'Projects', 'dummy-react-app');
const needsConfigurationHeadline = NEEDS_CONFIGURATION_MESSAGE.split('.')[0];

function renderApp(backendClient: Partial<BackendClient>, columns = 80, rows = 40) {
  const store = createStore();
  store.set(productVersionAtom, '0.1.0');
  store.set(workspaceCwdAtom, workspaceCwd);
  store.set(columnsTestOverrideAtom, columns);
  store.set(rowsTestOverrideAtom, rows);
  // Fill the full seam so the after-turn git refresh has a gitStatus to call;
  // submit tests only override submit.
  const client: BackendClient = {
    gitStatus: async () => null,
    pullRequest: async () => null,
    submit: async () => {
      throw new Error('submit not provided');
    },
    ...backendClient
  };
  store.set(backendClientAtom, client);
  return { store, ...renderWithJotai(<App />, store) };
}

// A fake backend that acks needsConfiguration, matching the bootstrap slice where
// no provider is wired yet.
function needsConfigurationBackend() {
  return vi.fn(async (): Promise<SubmitOutcome> => ({ kind: 'needsConfiguration' }));
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

describe('App submit and configuration notice', () => {
  it('appends the prompt and routes to the configuration notice when Enter is pressed', async () => {
    const submitFn = needsConfigurationBackend();
    const { lastFrame, stdin } = renderApp({ submit: submitFn });

    await submit(stdin, 'hello from tui');

    const frame = await waitForFrame(lastFrame, (output) =>
      output.includes(needsConfigurationHeadline)
    );
    expect(frame).toContain('❯ hello from tui');
    expect(submitFn).toHaveBeenCalledWith({ text: 'hello from tui' });
  });

  it('preserves Unicode and surrounding spaces in the submitted text', async () => {
    const submitFn = needsConfigurationBackend();
    const { lastFrame, stdin } = renderApp({ submit: submitFn }, 120);

    await submit(stdin, ' café ☕ ');

    await waitForFrame(lastFrame, (output) => output.includes('café ☕'));
    expect(submitFn).toHaveBeenCalledWith({ text: ' café ☕ ' });
  });

  it('queues consecutive submits, marking only the later prompts pending', async () => {
    const pending: Array<{ text: string; resolve: (outcome: SubmitOutcome) => void }> = [];
    const submitFn = vi.fn(
      (params: SubmitParams): Promise<SubmitOutcome> =>
        new Promise((resolve) => {
          pending.push({ text: params.text, resolve });
        })
    );
    const { lastFrame, stdin } = renderApp({ submit: submitFn });

    await submit(stdin, 'first');
    await submit(stdin, 'second');
    await submit(stdin, 'third');

    const queuedFrame = await waitForFrame(
      lastFrame,
      (output) => output.includes('second (pending)') && output.includes('third (pending)')
    );
    expect(submitFn).toHaveBeenCalledTimes(1);
    expect(submitFn).toHaveBeenNthCalledWith(1, { text: 'first' });
    expect(queuedFrame).toContain('❯ first');
    expect(queuedFrame).not.toContain('first (pending)');

    pending[0]?.resolve({ kind: 'needsConfiguration' });

    const drainedFrame = await waitForFrame(
      lastFrame,
      (output) =>
        output.includes(needsConfigurationHeadline) && !output.includes('second (pending)')
    );
    expect(submitFn).toHaveBeenCalledTimes(2);
    expect(submitFn).toHaveBeenNthCalledWith(2, { text: 'second' });
    expect(drainedFrame).toContain('third (pending)');
  });

  it('shows a red backend failure for the matching prompt', async () => {
    const submitFn = vi.fn(async (): Promise<SubmitOutcome> => {
      throw new BackendClientError(BackendErrorKind.Transport, 'connection died');
    });
    const { lastFrame, stdin } = renderApp({ submit: submitFn });

    await submit(stdin, 'will fail');

    const frame = await waitForFrame(lastFrame, (output) =>
      output.includes('ERROR: Rust backend failed')
    );
    expect(frame).toContain('❯ will fail');
    expect(frame).toContain('connection died');
  });

  it('escapes terminal-control characters in backend error output before rendering', async () => {
    const submitFn = vi.fn(async (): Promise<SubmitOutcome> => {
      throw new BackendClientError(BackendErrorKind.Transport, 'evil\u001b[2Jcleared');
    });
    const { lastFrame, stdin } = renderApp({ submit: submitFn }, 120, 20);

    await submit(stdin, 'trigger');

    const frame = await waitForFrame(lastFrame, (output) => output.includes('evil\\x1b[2Jcleared'));
    expect(frame).not.toContain('evil\u001b[2J');
  });

  it('does not call the backend for whitespace-only submits', async () => {
    const submitFn = needsConfigurationBackend();
    const { stdin } = renderApp({ submit: submitFn });

    await submit(stdin, '   ');
    await flushInput();

    expect(submitFn).not.toHaveBeenCalled();
  });

  it('posts an unknown slash command and its error into the body without a backend call', async () => {
    const submitFn = needsConfigurationBackend();
    const { lastFrame, stdin, store } = renderApp({ submit: submitFn });

    await submit(stdin, '/nope');

    const frame = await waitForFrame(lastFrame, (output) =>
      output.includes('Unknown command: /nope')
    );
    expect(frame).toContain('❯ /nope');
    expect(submitFn).not.toHaveBeenCalled();
    expect(store.get(promptQueueAtom).some((item) => item.state === 'active')).toBe(false);
  });
});
