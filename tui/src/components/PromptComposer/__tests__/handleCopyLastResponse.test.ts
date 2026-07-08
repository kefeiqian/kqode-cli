import { createStore } from 'jotai';
import type { Key } from 'ink';
import { describe, expect, it, vi } from 'vitest';
import { handleCopyLastResponse } from '@components/PromptComposer/input/handleCopyLastResponse.ts';
import type { ComposerKeyContext } from '@components/PromptComposer/input/types.ts';
import { BodyEntryKind } from '@constants/bodyEntry.ts';
import {
  COPY_LAST_RESPONSE_FAILED_HINT,
  COPY_LAST_RESPONSE_NOTHING_HINT,
  COPY_LAST_RESPONSE_SUCCEEDED_HINT
} from '@constants/ui.ts';
import { clipboardClientAtom } from '@state/global/index.ts';
import { promptQueueAtom } from '@state/promptQueue/index.ts';
import { transientStatusHintAtom } from '@state/ui/index.ts';
import { composerStateAtom } from '@state/ui/composer/index.ts';

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

function context(store: ReturnType<typeof createStore>): ComposerKeyContext {
  return {
    input: 'o',
    key: { ctrl: true } as Key,
    state: store.get(composerStateAtom),
    maxBytes: 100,
    onSubmit: vi.fn(),
    commandActions: {
      exit: vi.fn(),
      clearTranscript: vi.fn(),
      showHelp: vi.fn(),
      openLogin: vi.fn(),
      openModel: vi.fn(),
      openResume: vi.fn()
    },
    store
  };
}

describe('handleCopyLastResponse', () => {
  it('writes the last response and shows a copied hint', async () => {
    const store = createStore();
    const writeText = vi.fn().mockResolvedValue(true);
    store.set(clipboardClientAtom, { readText: vi.fn(), writeText });
    store.set(promptQueueAtom, [
      {
        id: 1,
        text: 'prompt',
        state: 'settled',
        result: { kind: BodyEntryKind.Assistant, text: 'answer' }
      }
    ]);

    expect(handleCopyLastResponse(context(store))).toBe(true);
    await flushPromises();

    expect(writeText).toHaveBeenCalledWith('answer');
    expect(store.get(transientStatusHintAtom)?.text).toBe(COPY_LAST_RESPONSE_SUCCEEDED_HINT);
  });

  it('shows nothing-to-copy without writing when no assistant response exists', () => {
    const store = createStore();
    const writeText = vi.fn();
    store.set(clipboardClientAtom, { readText: vi.fn(), writeText });

    expect(handleCopyLastResponse(context(store))).toBe(true);

    expect(writeText).not.toHaveBeenCalled();
    expect(store.get(transientStatusHintAtom)?.text).toBe(COPY_LAST_RESPONSE_NOTHING_HINT);
  });

  it('shows copy-failed when the clipboard write returns false', async () => {
    const store = createStore();
    store.set(clipboardClientAtom, { readText: vi.fn(), writeText: vi.fn().mockResolvedValue(false) });
    store.set(promptQueueAtom, [
      {
        id: 1,
        text: 'prompt',
        state: 'settled',
        result: { kind: BodyEntryKind.Assistant, text: 'answer' }
      }
    ]);

    expect(handleCopyLastResponse(context(store))).toBe(true);
    await flushPromises();

    expect(store.get(transientStatusHintAtom)?.text).toBe(COPY_LAST_RESPONSE_FAILED_HINT);
  });
});
