import { createStore } from 'jotai';
import { describe, expect, it, vi } from 'vitest';
import { PromptComposer } from '@components/PromptComposer/index.tsx';
import { composerStateAtom } from '@state/ui/composer/index.ts';
import { flushInput } from '@test/flushInput.ts';
import { renderWithJotai } from '@test/renderWithJotai.tsx';

// Characterization: Ink sets `stdin.setEncoding('utf8')` and its input parser
// buffers a paste-in-progress until the `ESC[201~` end marker, so large
// multibyte pastes (CJK, emoji, box-drawing, accented) survive stdin chunk
// boundaries. These lock that behavior in; no reassembly fix was needed.
describe('usePasteInput multibyte integrity', () => {
  const PAYLOAD = '你好世界 😀🎉 │┃ café '.repeat(20);

  it('inserts a large multibyte bracketed paste intact', async () => {
    const store = createStore();
    const { stdin } = renderWithJotai(
      <PromptComposer columns={80} maxBytes={1_000_000} onSubmit={vi.fn()} />,
      store
    );

    stdin.write(`\u001B[200~${PAYLOAD}\u001B[201~`);
    await flushInput();

    expect(store.get(composerStateAtom).text).toBe(PAYLOAD);
  });

  it('reassembles a bracketed paste split across stdin chunks', async () => {
    const store = createStore();
    const payload = '你好世界😀🎉│┃café';
    const { stdin } = renderWithJotai(
      <PromptComposer columns={80} maxBytes={1_000_000} onSubmit={vi.fn()} />,
      store
    );

    // The paste-end marker only arrives in the second write, so Ink must hold
    // the partial paste in its pending buffer across chunks.
    stdin.write(`\u001B[200~${payload.slice(0, 4)}`);
    await flushInput();
    stdin.write(`${payload.slice(4)}\u001B[201~`);
    await flushInput();

    expect(store.get(composerStateAtom).text).toBe(payload);
  });
});
