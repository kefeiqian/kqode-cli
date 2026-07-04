import { createStore } from 'jotai';
import { describe, expect, it } from 'vitest';
import {
  appendUnknownCommandAtom,
  clearTranscriptAtom,
  enqueuePromptAtom,
  promptQueueAtom
} from '@state/promptQueue/atoms.ts';
import { BACKEND_UNAVAILABLE_MESSAGE } from '@libs/promptQueue/promptQueue.ts';
import { bodyScrollOffsetRowsAtom, submittedPromptEntriesAtom } from '@state/ui/index.ts';

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

describe('clearTranscriptAtom', () => {
  it('empties the queue and entries and resets scroll', async () => {
    const store = createStore();
    await store.set(enqueuePromptAtom, 'hello');
    store.set(bodyScrollOffsetRowsAtom, 5);
    expect(store.get(submittedPromptEntriesAtom).length).toBeGreaterThan(0);

    store.set(clearTranscriptAtom);

    expect(store.get(promptQueueAtom)).toEqual([]);
    expect(store.get(submittedPromptEntriesAtom)).toEqual([]);
    expect(store.get(bodyScrollOffsetRowsAtom)).toBe(0);
  });
});

describe('appendUnknownCommandAtom', () => {
  it('posts the raw command as a prompt entry and a red error entry without a backend call', () => {
    const store = createStore();

    store.set(appendUnknownCommandAtom, '/nope arg1 arg2');

    const entries = store.get(submittedPromptEntriesAtom);
    expect(entries.map((entry) => ({ kind: entry.kind, text: entry.text }))).toEqual([
      { kind: 'user', text: '/nope arg1 arg2' },
      { kind: 'error', text: 'Unknown command: /nope' }
    ]);
    expect(store.get(promptQueueAtom).every((item) => item.state === 'settled')).toBe(true);
  });

  it('resets the scroll offset so the newest entry stays visible', () => {
    const store = createStore();
    store.set(bodyScrollOffsetRowsAtom, 5);

    store.set(appendUnknownCommandAtom, '/nope');

    expect(store.get(bodyScrollOffsetRowsAtom)).toBe(0);
  });
});
