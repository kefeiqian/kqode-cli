import { createStore } from 'jotai';
import { describe, expect, it } from 'vitest';
import { activeTurnIdAtom, promptQueueAtom } from '@state/promptQueue/index.ts';

describe('activeTurnIdAtom', () => {
  it('returns the backend turn id for the active queue item', () => {
    const store = createStore();
    store.set(promptQueueAtom, [
      { id: 0, turnId: 'turn-settled', text: 'done', state: 'settled' },
      { id: 1, turnId: 'turn-active', text: 'running', state: 'active' },
      { id: 2, turnId: 'turn-queued', text: 'next', state: 'queued' }
    ]);

    expect(store.get(activeTurnIdAtom)).toBe('turn-active');
  });

  it('returns null when no active queue item has a backend turn id', () => {
    const store = createStore();
    store.set(promptQueueAtom, [
      { id: 0, turnId: 'turn-settled', text: 'done', state: 'settled' },
      { id: 1, text: 'local active', state: 'active' },
      { id: 2, turnId: 'turn-queued', text: 'next', state: 'queued' }
    ]);

    expect(store.get(activeTurnIdAtom)).toBeNull();
  });
});
