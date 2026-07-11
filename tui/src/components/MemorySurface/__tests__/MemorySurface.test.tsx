import { createStore } from 'jotai';
import { describe, expect, it, vi } from 'vitest';
import type { BackendClient, MemoryInboxEntry, MemoryItem } from '@contracts/backend/index.ts';
import { backendClientAtom } from '@state/global/index.ts';
import { activeSurfaceAtom, columnsTestOverrideAtom, rowsTestOverrideAtom, Surface } from '@state/ui/index.ts';
import {
  MemoryMode,
  PendingMemoryItemAction,
  memoryFormAtom,
  memoryModeAtom,
  openAddMemoryFormAtom,
  setPendingMemoryItemActionAtom
} from '@state/ui/memory/index.ts';
import { renderWithJotai } from '@test/renderWithJotai.tsx';
import { flushInput } from '@test/flushInput.ts';
import { memoryBackendStub } from '@test/backendMemoryStub.ts';
import { themeBackendStub } from '@test/backendThemeStub.ts';
import { MemorySurface } from '@components/MemorySurface/index.tsx';

function sampleItem(overrides: Partial<MemoryItem> = {}): MemoryItem {
  return {
    id: 'item-1',
    scope: 'user',
    scopeId: null,
    memoryType: 'decision',
    title: 'Use tabs in Go',
    active: true,
    source: 'manual',
    sourceSessionId: null,
    sourceTurnStart: null,
    sourceTurnEnd: null,
    contentHash: 'abc',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides
  };
}

function sampleEntry(overrides: Partial<MemoryInboxEntry> = {}): MemoryInboxEntry {
  return {
    id: 'entry-1',
    status: 'candidate',
    scope: 'user',
    scopeId: null,
    targetItemId: null,
    memoryType: 'user',
    title: 'inferred pref',
    confidence: 0.3,
    reason: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides
  };
}

function fakeClient(memory: { items?: MemoryItem[]; inbox?: MemoryInboxEntry[]; fail?: boolean }): BackendClient {
  return {
    ...memoryBackendStub(),
    ...themeBackendStub(),
    submit: async () => undefined,
    onTranscriptEvent: () => () => undefined,
    clearConversation: async () => undefined,
    cancelTurn: async () => undefined,
    gitStatus: async () => null,
    listProviders: async () => ({ providers: [] }),
    getActiveSelection: async () => ({ providerId: null, modelId: null }),
    setActiveSelection: async () => undefined,
    clearProviderKey: async () => undefined,
    setProviderKey: async () => ({ outcome: 'unreachable', selectedModel: null }),
    listModels: async () => ({ status: 'failed', models: [] }),
    listSessions: async () => ({ sessions: [] }),
    resumeSession: async () => ({
      sessionId: 'sess-1',
      workspaceCwd: 'C:\\workspace',
      canonicalWorkspaceCwd: 'C:\\workspace',
      turns: []
    }),
    listMemory: memory.fail
      ? async () => {
          throw new Error('memory backend boom');
        }
      : async () => ({ items: memory.items ?? [] }),
    listMemoryInbox: async () => ({ entries: memory.inbox ?? [] })
  };
}

function renderMemory(client: BackendClient, mode: MemoryMode = MemoryMode.Active, columns = 100, rows = 14) {
  const store = createStore();
  store.set(activeSurfaceAtom, Surface.Memory);
  store.set(memoryModeAtom, mode);
  store.set(backendClientAtom, client);
  store.set(columnsTestOverrideAtom, columns);
  store.set(rowsTestOverrideAtom, rows);
  return { store, ...renderWithJotai(<MemorySurface />, store) };
}

async function waitForFrame(lastFrame: () => string | undefined, text: string) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const frame = lastFrame() ?? '';
    if (frame.includes(text)) {
      return frame;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`Timed out waiting for ${text}. Last frame:\n${lastFrame() ?? ''}`);
}

describe('MemorySurface', () => {
  it('renders active memory rows with scope, type, and title', async () => {
    const { lastFrame } = renderMemory(fakeClient({ items: [sampleItem()] }));
    const frame = await waitForFrame(lastFrame, 'Use tabs in Go');
    expect(frame).toContain('/memory');
    expect(frame).toContain('Title');
    expect(frame).toContain('decision');
    expect(frame).toContain('user');
    // The highlighted (first) row now carries the shared chevron marker, which —
    // unlike the old reverse-video highlight — is directly visible in the frame.
    expect(frame).toContain('❯');
  });

  it('renders inbox rows with review status', async () => {
    const { lastFrame } = renderMemory(
      fakeClient({ inbox: [sampleEntry({ status: 'active_audit', title: 'auto update' })] }),
      MemoryMode.Inbox
    );
    const frame = await waitForFrame(lastFrame, 'auto update');
    expect(frame).toContain('[Inbox]');
    expect(frame).toContain('active_audit');
  });

  it('shows an actionable empty state for an empty corpus', async () => {
    const { lastFrame } = renderMemory(fakeClient({ items: [] }));
    expect(await waitForFrame(lastFrame, 'No memory yet.')).toContain('/memory add');
  });

  it('shows a surface error without crashing when the backend fails', async () => {
    const { lastFrame } = renderMemory(fakeClient({ fail: true }));
    const frame = await waitForFrame(lastFrame, 'boom');
    expect(frame).toContain('/memory');
  });

  it('submits the add form as a repo project memory and refreshes', async () => {
    const addMemory = vi.fn(async () => ({ item: sampleItem({ scope: 'repo', memoryType: 'project', title: 'New fact' }) }));
    const client = fakeClient({ items: [sampleItem({ scope: 'repo', memoryType: 'project', title: 'New fact' })] });
    client.addMemory = addMemory;
    const { store, stdin, lastFrame } = renderMemory(client);
    store.set(openAddMemoryFormAtom);
    await waitForFrame(lastFrame, 'Add project memory');

    stdin.write('New fact');
    await flushInput();
    stdin.write('\t');
    await flushInput();
    stdin.write('Body line');
    await flushInput();
    stdin.write('\r');
    await waitForFrame(lastFrame, 'New fact');

    expect(addMemory).toHaveBeenCalledWith({
      scope: 'repo',
      memoryType: 'project',
      title: 'New fact',
      body: 'Body line'
    });
    expect(store.get(memoryFormAtom)).toBeNull();
  });

  it('keeps a composer-opened add form through the mount-time refresh', async () => {
    // Production order: the composer sets the form BEFORE the surface mounts, so
    // the mount-time refresh() must not clobber the just-opened form (regression
    // for /memory add|edit|forget collapsing to the plain list).
    const store = createStore();
    store.set(backendClientAtom, fakeClient({ items: [sampleItem()] }));
    store.set(columnsTestOverrideAtom, 100);
    store.set(rowsTestOverrideAtom, 14);
    store.set(activeSurfaceAtom, Surface.Memory);
    store.set(memoryModeAtom, MemoryMode.Active);
    store.set(openAddMemoryFormAtom);

    const { lastFrame } = renderWithJotai(<MemorySurface />, store);

    expect(await waitForFrame(lastFrame, 'Add project memory')).toContain('Add project memory');
    expect(store.get(memoryFormAtom)).not.toBeNull();
  });

  it('blocks empty add titles and keeps Esc local to the form', async () => {
    const client = fakeClient({ items: [] });
    const { store, stdin, lastFrame } = renderMemory(client);
    store.set(openAddMemoryFormAtom);
    await waitForFrame(lastFrame, 'Add project memory');

    stdin.write('\r');
    const frame = await waitForFrame(lastFrame, 'Title is required');
    expect(frame).toContain('Title is required');
    expect(client.addMemory).not.toHaveBeenCalled();

    stdin.write('\u001B');
    await flushInput();
    await waitForFrame(lastFrame, 'No memory yet.');
    expect(store.get(activeSurfaceAtom)).toBe(Surface.Memory);
  });

  it('picks an active memory to edit, preloads its body, and submits edits', async () => {
    const original = sampleItem({ id: 'edit-1', title: 'Old title', scope: 'repo' });
    const showMemory = vi.fn(async () => ({ item: original, body: 'Old body' }));
    const editMemory = vi.fn(async () => ({ item: { ...original, title: 'Old title updated' } }));
    const client = fakeClient({ items: [original] });
    client.showMemory = showMemory;
    client.editMemory = editMemory;
    const { store, stdin, lastFrame } = renderMemory(client);
    await waitForFrame(lastFrame, 'Old title');

    store.set(setPendingMemoryItemActionAtom, PendingMemoryItemAction.Edit);
    await waitForFrame(lastFrame, 'Pick a memory to edit');
    stdin.write('\r');
    await waitForFrame(lastFrame, 'Edit project memory');
    expect(showMemory).toHaveBeenCalledWith({ scope: 'repo', id: 'edit-1' });

    stdin.write(' updated');
    await flushInput();
    stdin.write('\t');
    await flushInput();
    stdin.write(' updated');
    await flushInput();
    stdin.write('\r');
    await waitForFrame(lastFrame, 'Old title');

    expect(editMemory).toHaveBeenCalledWith({
      scope: 'repo',
      id: 'edit-1',
      title: 'Old title updated',
      body: 'Old body updated'
    });
    expect(store.get(memoryFormAtom)).toBeNull();
  });

  it('aborts edit pick on body fetch failure without opening the form', async () => {
    const client = fakeClient({ items: [sampleItem()] });
    client.showMemory = vi.fn(async () => {
      throw new Error('show failed');
    });
    const { store, stdin, lastFrame } = renderMemory(client);
    await waitForFrame(lastFrame, 'Use tabs in Go');

    store.set(setPendingMemoryItemActionAtom, PendingMemoryItemAction.Edit);
    stdin.write('\r');
    const frame = await waitForFrame(lastFrame, 'show failed');

    expect(frame).not.toContain('Edit project memory');
    expect(store.get(memoryFormAtom)).toBeNull();
  });

  it('routes x through confirmation before forgetting', async () => {
    const forgetMemory = vi.fn(async () => ({ id: 'item-1', forgotten: true }));
    const client = fakeClient({ items: [sampleItem()] });
    client.forgetMemory = forgetMemory;
    const { stdin, lastFrame } = renderMemory(client);
    await waitForFrame(lastFrame, 'Use tabs in Go');

    stdin.write('x');
    let frame = await waitForFrame(lastFrame, 'y forget');
    expect(frame).toContain('Use tabs in Go');
    expect(forgetMemory).not.toHaveBeenCalled();

    stdin.write('\r');
    await flushInput();
    expect(forgetMemory).not.toHaveBeenCalled();

    stdin.write('x');
    await waitForFrame(lastFrame, 'y forget');
    stdin.write('y');
    await flushInput();
    expect(forgetMemory).toHaveBeenCalledWith({ scope: 'user', id: 'item-1' });
  });

  it('picks and confirms forget from the pending action flow', async () => {
    const forgetMemory = vi.fn(async () => ({ id: 'item-1', forgotten: true }));
    const client = fakeClient({ items: [sampleItem()] });
    client.forgetMemory = forgetMemory;
    const { store, stdin, lastFrame } = renderMemory(client);
    await waitForFrame(lastFrame, 'Use tabs in Go');

    store.set(setPendingMemoryItemActionAtom, PendingMemoryItemAction.Forget);
    await flushInput();
    stdin.write('\r');
    await waitForFrame(lastFrame, 'y forget');
    stdin.write('n');
    await flushInput();
    expect(forgetMemory).not.toHaveBeenCalled();

    store.set(setPendingMemoryItemActionAtom, PendingMemoryItemAction.Forget);
    await flushInput();
    stdin.write('\r');
    await waitForFrame(lastFrame, 'y forget');
    stdin.write('y');
    await flushInput();
    expect(forgetMemory).toHaveBeenCalledTimes(1);
  });

  it('keeps the footer + indicator on one row so the divider and title do not collapse (P007 U5 review)', async () => {
    // Regression: the long Inbox footer hint used to shrink-wrap to a 2nd row
    // when the scroll indicator appeared, over-subscribing the fixed-height
    // panel and collapsing the accent divider onto the /memory title.
    const inbox = Array.from({ length: 12 }, (_, index) =>
      sampleEntry({ id: `e${index}`, status: 'candidate', title: `entry ${index}` })
    );
    const { lastFrame } = renderMemory(fakeClient({ inbox }), MemoryMode.Inbox, 80, 24);
    await waitForFrame(lastFrame, 'entry 0');

    const lines = (lastFrame() ?? '').split('\n');
    const titleLine = lines.find((line) => line.includes('/memory'));
    expect(lines.some((line) => /^─+\s*$/.test(line))).toBe(true); // divider is its own clean row
    expect(titleLine).toBeDefined();
    expect(titleLine).not.toMatch(/─/); // title row is not merged with the divider
    expect(lastFrame() ?? '').toContain('more'); // scroll indicator visible on one footer row
  });
});
