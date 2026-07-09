import { createStore } from 'jotai';
import { describe, expect, it } from 'vitest';
import type { BackendClient, MemoryInboxEntry, MemoryItem } from '@contracts/backend/index.ts';
import { backendClientAtom } from '@state/global/index.ts';
import { activeSurfaceAtom, columnsTestOverrideAtom, rowsTestOverrideAtom, Surface } from '@state/ui/index.ts';
import { MemoryMode, memoryModeAtom } from '@state/ui/memory/index.ts';
import { renderWithJotai } from '@test/renderWithJotai.tsx';
import { memoryBackendStub } from '@test/backendMemoryStub.ts';
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
});
