import { createStore } from 'jotai';
import type { Key } from 'ink';
import { describe, expect, it, vi } from 'vitest';
import { handlePaste } from '@components/PromptComposer/input/handlePaste.ts';
import { handleTextEdit } from '@components/PromptComposer/input/handleTextEdit.ts';
import type { ComposerKeyContext } from '@components/PromptComposer/input/types.ts';
import { clipboardClientAtom } from '@state/global/index.ts';
import { composerStateAtom } from '@state/ui/composer/index.ts';
import { transientStatusHintAtom } from '@state/ui/index.ts';
import { PASTE_FAILED_HINT } from '@constants/ui.ts';

const noopActions = {
  exit: vi.fn(),
  clearTranscript: vi.fn(),
  showHelp: vi.fn(),
  openLogin: vi.fn(),
  openModel: vi.fn(),
  openResume: vi.fn(),
  openMemory: vi.fn(),
  openTheme: vi.fn()
};

function context(
  store: ReturnType<typeof createStore>,
  input: string,
  key: Partial<Key>
): ComposerKeyContext {
  return {
    input,
    key: key as Key,
    state: store.get(composerStateAtom),
    maxBytes: 100,
    onSubmit: vi.fn(),
    commandActions: noopActions,
    store
  };
}

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('handlePaste', () => {
  it('reads and inserts sanitized clipboard text for raw Ctrl+V', async () => {
    const store = createStore();
    const readText = vi.fn().mockResolvedValue('a\r\nb\u001Bc');
    store.set(clipboardClientAtom, { readText, writeText: vi.fn() });

    expect(handlePaste(context(store, 'v', { ctrl: true }))).toBe(true);
    await flushPromises();

    expect(readText).toHaveBeenCalledTimes(1);
    expect(store.get(composerStateAtom).text).toBe('a\nbc');
  });

  it('does not treat a bracketed paste payload as a paste shortcut', () => {
    const store = createStore();
    const readText = vi.fn();
    store.set(clipboardClientAtom, { readText, writeText: vi.fn() });

    expect(handlePaste(context(store, 'first\nsecond', {}))).toBe(false);

    expect(readText).not.toHaveBeenCalled();
  });

  it('reads and inserts clipboard text for Alt+V', async () => {
    const store = createStore();
    store.set(clipboardClientAtom, { readText: vi.fn().mockResolvedValue('alt'), writeText: vi.fn() });

    expect(handlePaste(context(store, 'v', { meta: true }))).toBe(true);
    await flushPromises();

    expect(store.get(composerStateAtom).text).toBe('alt');
  });

  it('ignores repeat paste shortcuts while a read is in flight', async () => {
    const store = createStore();
    let resolveRead: (text: string) => void = () => undefined;
    const readText = vi.fn(
      () => new Promise<string>((resolve) => {
        resolveRead = resolve;
      })
    );
    store.set(clipboardClientAtom, { readText, writeText: vi.fn() });

    expect(handlePaste(context(store, 'v', { ctrl: true }))).toBe(true);
    expect(handlePaste(context(store, 'v', { ctrl: true }))).toBe(true);
    resolveRead('once');
    await flushPromises();

    expect(readText).toHaveBeenCalledTimes(1);
    expect(store.get(composerStateAtom).text).toBe('once');
  });

  it('shows a paste-failed hint when the clipboard is unavailable', async () => {
    const store = createStore();
    store.set(clipboardClientAtom, { readText: vi.fn().mockResolvedValue(null), writeText: vi.fn() });

    expect(handlePaste(context(store, 'v', { ctrl: true }))).toBe(true);
    await flushPromises();

    expect(store.get(composerStateAtom).text).toBe('');
    expect(store.get(transientStatusHintAtom)?.text).toBe(PASTE_FAILED_HINT);
  });

  it('keeps Ctrl+V, Alt+V, and Ctrl+R out of text editing', () => {
    const store = createStore();

    expect(handleTextEdit(context(store, 'v', { ctrl: true }))).toBe(false);
    expect(handleTextEdit(context(store, 'v', { meta: true }))).toBe(false);
    expect(handleTextEdit(context(store, 'r', { ctrl: true }))).toBe(false);

    expect(store.get(composerStateAtom).text).toBe('');
  });
});
