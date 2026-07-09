import { vi } from 'vitest';
import type { BackendClient } from '@contracts/backend/index.ts';

/** The memory-facing subset of {@link BackendClient}. */
type MemoryBackendMethods = Pick<
  BackendClient,
  | 'listMemory'
  | 'showMemory'
  | 'addMemory'
  | 'editMemory'
  | 'forgetMemory'
  | 'reloadMemory'
  | 'listMemoryInbox'
  | 'applyMemoryInbox'
  | 'undoMemoryInbox'
>;

/**
 * Default no-op memory methods for test fakes that don't exercise `/memory`.
 * Spread into a fake `BackendClient` so it satisfies the full contract; tests
 * that need specific behavior override individual methods after the spread.
 */
export function memoryBackendStub(): MemoryBackendMethods {
  const notConfigured = (method: string) => async (): Promise<never> => {
    throw new Error(`${method} stub not configured`);
  };
  return {
    listMemory: vi.fn(async () => ({ items: [] })),
    showMemory: vi.fn<BackendClient['showMemory']>(notConfigured('showMemory')),
    addMemory: vi.fn<BackendClient['addMemory']>(notConfigured('addMemory')),
    editMemory: vi.fn<BackendClient['editMemory']>(notConfigured('editMemory')),
    forgetMemory: vi.fn(async () => ({ id: '', forgotten: false })),
    reloadMemory: vi.fn(async () => ({ items: [] })),
    listMemoryInbox: vi.fn(async () => ({ entries: [] })),
    applyMemoryInbox: vi.fn<BackendClient['applyMemoryInbox']>(notConfigured('applyMemoryInbox')),
    undoMemoryInbox: vi.fn<BackendClient['undoMemoryInbox']>(notConfigured('undoMemoryInbox'))
  };
}
