import { createStore } from 'jotai';
import { describe, expect, it } from 'vitest';
import {
  appendHelpAtom,
  clearTranscriptAtom,
  enqueuePromptAtom,
  promptQueueAtom
} from '@state/backend/atoms.ts';
import { BACKEND_UNAVAILABLE_MESSAGE } from '@state/backend/bodyEntries.ts';
import { COMMAND_REGISTRY } from '@state/commands/registry.ts';
import { bodyScrollOffsetRowsAtom, submittedPromptEntriesAtom } from '@state/homeScreen/index.ts';

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

describe('appendHelpAtom', () => {
  it('renders one info entry per command', () => {
    const store = createStore();

    store.set(appendHelpAtom);

    const entries = store.get(submittedPromptEntriesAtom);
    expect(entries).toHaveLength(COMMAND_REGISTRY.length);
    expect(entries.every((entry) => entry.kind === 'info')).toBe(true);

    const joined = entries.map((entry) => entry.text).join('\n');
    for (const command of COMMAND_REGISTRY) {
      expect(joined).toContain(command.name);
      expect(joined).toContain(command.description);
    }
  });

  it('adds a settled note that the drain loop never sends to the backend', () => {
    const store = createStore();

    store.set(appendHelpAtom);

    const queue = store.get(promptQueueAtom);
    expect(queue).toHaveLength(1);
    expect(queue[0]?.state).toBe('settled');
    expect(queue[0]?.kind).toBe('note');
  });

  it('keeps command output ordered after an earlier prompt', async () => {
    const store = createStore();
    await store.set(enqueuePromptAtom, 'first');
    store.set(appendHelpAtom);

    const entries = store.get(submittedPromptEntriesAtom);
    const firstPromptIndex = entries.findIndex((entry) => entry.kind === 'prompt');
    const firstNoteIndex = entries.findIndex((entry) => entry.kind === 'info');
    expect(firstPromptIndex).toBeGreaterThanOrEqual(0);
    expect(firstNoteIndex).toBeGreaterThan(firstPromptIndex);
  });
});
