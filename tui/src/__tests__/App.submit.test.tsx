import { createStore } from 'jotai';
import { describe, expect, it, vi } from 'vitest';
import { App } from '@/App.tsx';
import { BackendClientError, BackendErrorKind } from '@contracts/backend/index.ts';
import type { BackendClient } from '@contracts/backend/index.ts';
import { ACK_MESSAGE } from '@contracts/backend/index.ts';
import type { MessageSubmitParams, MessageSubmitResult } from '@contracts/backend/index.ts';
import {
  backendClientAtom,
  columnsTestOverrideAtom,
  productVersionAtom,
  rowsTestOverrideAtom,
  workspaceCwdAtom
} from '@state/global/index.ts';
import { flushInput } from '@test/flushInput.ts';
import { renderWithJotai } from '@test/renderWithJotai.tsx';

const workspaceCwd = 'C:\\Users\\kefeiqian\\Projects\\dummy-react-app';

function renderApp(backendClient: BackendClient, columns = 80, rows = 40) {
  const store = createStore();
  store.set(productVersionAtom, '0.1.0');
  store.set(workspaceCwdAtom, workspaceCwd);
  store.set(columnsTestOverrideAtom, columns);
  store.set(rowsTestOverrideAtom, rows);
  store.set(backendClientAtom, backendClient);
  return renderWithJotai(<App />, store);
}

function echoBackend() {
  return vi.fn(
    async ({ text }: MessageSubmitParams): Promise<MessageSubmitResult> => ({
      message: ACK_MESSAGE,
      receivedText: text
    })
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

describe('App submit and ACK output', () => {
  it('appends the prompt and the Rust backend ACK when Enter is pressed', async () => {
    const submitMessage = echoBackend();
    const { lastFrame, stdin } = renderApp({ submitMessage });

    await submit(stdin, 'hello from tui');

    const frame = await waitForFrame(lastFrame, (output) =>
      output.includes('Rust backend ACK - received: hello from tui')
    );
    expect(frame).toContain('❯ hello from tui');
    expect(submitMessage).toHaveBeenCalledWith({ text: 'hello from tui' });
  });

  it('preserves Unicode and surrounding spaces in the backend result', async () => {
    const submitMessage = echoBackend();
    const { lastFrame, stdin } = renderApp({ submitMessage }, 120);

    await submit(stdin, ' café ☕ ');

    await waitForFrame(lastFrame, (output) => output.includes('café ☕'));
    expect(submitMessage).toHaveBeenCalledWith({ text: ' café ☕ ' });
  });

  it('queues consecutive submits, marking only the later prompts pending', async () => {
    const pending: Array<{ text: string; resolve: (result: MessageSubmitResult) => void }> = [];
    const submitMessage = vi.fn(
      (params: MessageSubmitParams): Promise<MessageSubmitResult> =>
        new Promise((resolve) => {
          pending.push({ text: params.text, resolve });
        })
    );
    const { lastFrame, stdin } = renderApp({ submitMessage });

    await submit(stdin, 'first');
    await submit(stdin, 'second');
    await submit(stdin, 'third');

    const queuedFrame = await waitForFrame(
      lastFrame,
      (output) => output.includes('second (pending)') && output.includes('third (pending)')
    );
    expect(submitMessage).toHaveBeenCalledTimes(1);
    expect(submitMessage).toHaveBeenCalledWith({ text: 'first' });
    expect(queuedFrame).toContain('❯ first');
    expect(queuedFrame).not.toContain('first (pending)');

    pending[0]?.resolve({ message: ACK_MESSAGE, receivedText: 'first' });

    const drainedFrame = await waitForFrame(
      lastFrame,
      (output) =>
        output.includes('Rust backend ACK - received: first') && !output.includes('second (pending)')
    );
    expect(submitMessage).toHaveBeenCalledTimes(2);
    expect(submitMessage).toHaveBeenNthCalledWith(2, { text: 'second' });
    expect(drainedFrame).toContain('third (pending)');
  });

  it('shows a red backend failure for the matching prompt', async () => {
    const submitMessage = vi.fn(async (): Promise<MessageSubmitResult> => {
      throw new BackendClientError(BackendErrorKind.Transport, 'connection died');
    });
    const { lastFrame, stdin } = renderApp({ submitMessage });

    await submit(stdin, 'will fail');

    const frame = await waitForFrame(lastFrame, (output) =>
      output.includes('ERROR: Rust backend failed')
    );
    expect(frame).toContain('❯ will fail');
    expect(frame).toContain('connection died');
  });

  it('escapes terminal-control characters in backend output before rendering', async () => {
    const submitMessage = vi.fn(
      async (): Promise<MessageSubmitResult> => ({
        message: ACK_MESSAGE,
        receivedText: 'evil\u001b[2Jcleared'
      })
    );
    const { lastFrame, stdin } = renderApp({ submitMessage }, 120, 20);

    await submit(stdin, 'trigger');

    const frame = await waitForFrame(lastFrame, (output) => output.includes('evil\\x1b[2Jcleared'));
    expect(frame).not.toContain('evil\u001b[2J');
  });

  it('does not call the backend for whitespace-only submits', async () => {
    const submitMessage = echoBackend();
    const { stdin } = renderApp({ submitMessage });

    await submit(stdin, '   ');
    await flushInput();

    expect(submitMessage).not.toHaveBeenCalled();
  });
});
