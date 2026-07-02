import { createStore } from 'jotai';
import { describe, expect, it } from 'vitest';
import { enqueuePromptAtom } from '@state/backend/atoms.ts';
import { BACKEND_UNAVAILABLE_MESSAGE } from '@state/backend/bodyEntries.ts';
import { submittedPromptEntriesAtom } from '@state/homeScreen/index.ts';

describe('enqueuePromptAtom', () => {
  it('settles a visible error entry when no backend client is wired into the seam', async () => {
    const store = createStore();

    await store.set(enqueuePromptAtom, 'hello');

    const entries = store.get(submittedPromptEntriesAtom);
    const errorEntry = entries.find((entry) => entry.kind === 'error');
    expect(errorEntry).toBeDefined();
    expect(errorEntry?.text).toContain(BACKEND_UNAVAILABLE_MESSAGE);
  });
});
