import { createStore } from 'jotai';
import { describe, expect, it, vi } from 'vitest';
import type { BackendClient } from '@contracts/backend/index.ts';
import { backendClientAtom } from '@state/global/index.ts';
import { gitStatusAtom, refreshGitStatusAtom } from '@state/ui/gitStatus.ts';

function clientWithGitStatus(gitStatus: BackendClient['gitStatus']): BackendClient {
  return { submitStreaming: vi.fn(), gitStatus };
}

describe('refreshGitStatusAtom', () => {
  it('stores the label the backend returns', async () => {
    const store = createStore();
    store.set(
      backendClientAtom,
      clientWithGitStatus(async () => ({ label: '⎇ main*', pullRequestLabel: '#3' }))
    );

    await store.set(refreshGitStatusAtom);

    expect(store.get(gitStatusAtom)).toEqual({ label: '⎇ main*', pullRequestLabel: '#3' });
  });

  it('clears the label to undefined when the workspace is not a git repository', async () => {
    const store = createStore();
    store.set(gitStatusAtom, { label: '⎇ main' });
    store.set(backendClientAtom, clientWithGitStatus(async () => null));

    await store.set(refreshGitStatusAtom);

    expect(store.get(gitStatusAtom)).toBeUndefined();
  });

  it('keeps the last known label when the request fails', async () => {
    const store = createStore();
    store.set(gitStatusAtom, { label: '⎇ main' });
    store.set(
      backendClientAtom,
      clientWithGitStatus(async () => {
        throw new Error('transport died');
      })
    );

    await store.set(refreshGitStatusAtom);

    expect(store.get(gitStatusAtom)).toEqual({ label: '⎇ main' });
  });

  it('is a no-op when no backend client is wired', async () => {
    const store = createStore();

    await store.set(refreshGitStatusAtom);

    expect(store.get(gitStatusAtom)).toBeUndefined();
  });
});
