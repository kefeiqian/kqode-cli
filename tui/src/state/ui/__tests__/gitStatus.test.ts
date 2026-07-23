import { createStore } from 'jotai';
import { describe, expect, it, vi } from 'vitest';
import type { BackendClient } from '@contracts/backend/index.ts';
import { backendClientAtom } from '@state/global/index.ts';
import {
  gitStatusAtom,
  refreshGitStatusAtom,
  refreshPullRequestAtom
} from '@state/ui/gitStatus/index.ts';

function fakeClient(overrides: Partial<BackendClient> = {}): BackendClient {
  return {
    submit: vi.fn(),
    gitStatus: vi.fn().mockResolvedValue(null),
    pullRequest: vi.fn().mockResolvedValue(null),
    ...overrides
  };
}

describe('refreshGitStatusAtom', () => {
  it('stores the working-tree label the backend returns', async () => {
    const store = createStore();
    store.set(backendClientAtom, fakeClient({ gitStatus: async () => ({ label: '⎇ main*' }) }));

    await store.set(refreshGitStatusAtom);

    expect(store.get(gitStatusAtom)).toEqual({ label: '⎇ main*' });
  });

  it('preserves a pull-request segment fetched earlier when the label refreshes', async () => {
    const store = createStore();
    store.set(gitStatusAtom, {
      label: '⎇ main',
      pullRequestLabel: '#3',
      pullRequestUrl: 'https://github.com/o/r/pull/3'
    });
    store.set(backendClientAtom, fakeClient({ gitStatus: async () => ({ label: '⎇ main*' }) }));

    await store.set(refreshGitStatusAtom);

    expect(store.get(gitStatusAtom)).toEqual({
      label: '⎇ main*',
      pullRequestLabel: '#3',
      pullRequestUrl: 'https://github.com/o/r/pull/3'
    });
  });

  it('clears the status to undefined when the workspace is not a git repository', async () => {
    const store = createStore();
    store.set(gitStatusAtom, { label: '⎇ main' });
    store.set(backendClientAtom, fakeClient({ gitStatus: async () => null }));

    await store.set(refreshGitStatusAtom);

    expect(store.get(gitStatusAtom)).toBeUndefined();
  });

  it('keeps the last known status when the request fails', async () => {
    const store = createStore();
    store.set(gitStatusAtom, { label: '⎇ main' });
    store.set(
      backendClientAtom,
      fakeClient({
        gitStatus: async () => {
          throw new Error('transport died');
        }
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

describe('refreshPullRequestAtom', () => {
  it('merges the pull request onto an existing label', async () => {
    const store = createStore();
    store.set(gitStatusAtom, { label: '⎇ main' });
    store.set(
      backendClientAtom,
      fakeClient({
        pullRequest: async () => ({ label: '#3', url: 'https://github.com/o/r/pull/3' })
      })
    );

    await store.set(refreshPullRequestAtom);

    expect(store.get(gitStatusAtom)).toEqual({
      label: '⎇ main',
      pullRequestLabel: '#3',
      pullRequestUrl: 'https://github.com/o/r/pull/3'
    });
  });

  it('does nothing until a label exists to attach to', async () => {
    const store = createStore();
    store.set(backendClientAtom, fakeClient({ pullRequest: async () => ({ label: '#3' }) }));

    await store.set(refreshPullRequestAtom);

    expect(store.get(gitStatusAtom)).toBeUndefined();
  });

  it('keeps the last known pull request when the request fails', async () => {
    const store = createStore();
    store.set(gitStatusAtom, { label: '⎇ main', pullRequestLabel: '#3' });
    store.set(
      backendClientAtom,
      fakeClient({
        pullRequest: async () => {
          throw new Error('transport died');
        }
      })
    );

    await store.set(refreshPullRequestAtom);

    expect(store.get(gitStatusAtom)).toEqual({ label: '⎇ main', pullRequestLabel: '#3' });
  });

  it('is a no-op when no backend client is wired', async () => {
    const store = createStore();

    await store.set(refreshPullRequestAtom);

    expect(store.get(gitStatusAtom)).toBeUndefined();
  });
});
