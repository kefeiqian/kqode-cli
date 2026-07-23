import { createStore } from 'jotai';
import { describe, expect, it } from 'vitest';
import {
  appendUnknownCommandAtom,
  clearTranscriptAtom,
  enqueuePromptAtom,
  promptQueueAtom
} from '@state/promptQueue/index.ts';
import { backendClientAtom } from '@state/global/index.ts';
import { BACKEND_UNAVAILABLE_MESSAGE } from '@libs/promptQueue/promptQueue.ts';
import { bodyScrollOffsetRowsAtom, submittedPromptEntriesAtom } from '@state/ui/index.ts';
import type { BackendClient, SubmitOutcome } from '@contracts/backend/index.ts';

async function waitForCondition(condition: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (condition()) {
      return;
    }
    await Promise.resolve();
  }
  throw new Error('condition was not met');
}

describe('enqueuePromptAtom', () => {
  it('settles a visible error entry when no backend client is wired into the seam', async () => {
    const store = createStore();

    await store.set(enqueuePromptAtom, 'hello');

    const entries = store.get(submittedPromptEntriesAtom);
    const errorEntry = entries.find((entry) => entry.kind === 'error');
    expect(errorEntry).toBeDefined();
    expect(errorEntry?.text).toContain(BACKEND_UNAVAILABLE_MESSAGE);
  });

  it('does not promote queued prompts when a cleared active turn settles late', async () => {
    const store = createStore();
    const resolvers: Array<(outcome: SubmitOutcome) => void> = [];
    const backendClient: BackendClient = {
      gitStatus: async () => null,
      pullRequest: async () => null,
      submit: async () =>
        new Promise<SubmitOutcome>((resolve) => {
          resolvers.push(resolve);
        })
    };
    store.set(backendClientAtom, backendClient);

    const first = store.set(enqueuePromptAtom, 'first');
    store.set(clearTranscriptAtom);
    const second = store.set(enqueuePromptAtom, 'second');
    const third = store.set(enqueuePromptAtom, 'third');

    resolvers[0]?.({ kind: 'needsConfiguration' });
    await waitForCondition(() => resolvers.length === 2);

    expect(store.get(promptQueueAtom).map((item) => ({ text: item.text, state: item.state }))).toEqual([
      { text: 'second', state: 'active' },
      { text: 'third', state: 'queued' }
    ]);

    resolvers[1]?.({ kind: 'needsConfiguration' });
    await waitForCondition(() => resolvers.length === 3);
    resolvers[2]?.({ kind: 'needsConfiguration' });
    await Promise.all([first, second, third]);
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
