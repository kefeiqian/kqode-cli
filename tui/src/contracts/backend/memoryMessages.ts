/**
 * Wire contract for backend-owned `/memory` APIs.
 *
 * Mirrors `src/protocol/memory.rs`; method names and field shapes must change in
 * lockstep with the Rust side. Scope/type/status/action travel as strings.
 */

export const MEMORY_LIST_METHOD = 'kqode.memory.list';
export const MEMORY_SHOW_METHOD = 'kqode.memory.show';
export const MEMORY_ADD_METHOD = 'kqode.memory.add';
export const MEMORY_EDIT_METHOD = 'kqode.memory.edit';
export const MEMORY_FORGET_METHOD = 'kqode.memory.forget';
export const MEMORY_RELOAD_METHOD = 'kqode.memory.reload';
export const MEMORY_INBOX_LIST_METHOD = 'kqode.memory.inbox.list';
export const MEMORY_INBOX_APPLY_METHOD = 'kqode.memory.inbox.apply';
export const MEMORY_INBOX_UNDO_METHOD = 'kqode.memory.inbox.undo';

export type MemoryScope = 'user' | 'repo' | 'folder' | 'session';

export type MemoryType = 'user' | 'feedback' | 'project' | 'decision' | 'badcase' | 'reference';

export type MemorySource = 'manual' | 'extraction' | 'external';

export type InboxStatus =
  | 'candidate'
  | 'active_audit'
  | 'approved'
  | 'rejected'
  | 'stale'
  | 'undone'
  | 'failed';

export type InboxAction = 'approve' | 'reject' | 'stale';

export type MemoryItem = {
  id: string;
  scope: MemoryScope;
  scopeId: string | null;
  memoryType: MemoryType;
  title: string;
  active: boolean;
  source: MemorySource;
  sourceSessionId: string | null;
  sourceTurnStart: number | null;
  sourceTurnEnd: number | null;
  contentHash: string;
  createdAt: number;
  updatedAt: number;
};

export type MemoryInboxEntry = {
  id: string;
  status: InboxStatus;
  scope: MemoryScope;
  scopeId: string | null;
  targetItemId: string | null;
  memoryType: MemoryType | null;
  title: string | null;
  confidence: number | null;
  reason: string | null;
  createdAt: number;
  updatedAt: number;
};

export type MemoryListParams = {
  scope?: MemoryScope;
  activeOnly?: boolean;
};

export type MemoryListResult = {
  items: MemoryItem[];
};

export type MemoryShowParams = {
  scope: MemoryScope;
  scopeId?: string;
  id: string;
};

export type MemoryShowResult = {
  item: MemoryItem;
  body: string;
};

export type MemoryAddParams = {
  scope: MemoryScope;
  scopeId?: string;
  memoryType: MemoryType;
  title: string;
  body: string;
};

export type MemoryEditParams = {
  scope: MemoryScope;
  scopeId?: string;
  id: string;
  title?: string;
  body?: string;
};

export type MemoryForgetParams = {
  scope: MemoryScope;
  scopeId?: string;
  id: string;
};

export type MemoryMutationResult = {
  item: MemoryItem;
};

export type MemoryForgetResult = {
  id: string;
  forgotten: boolean;
};

export type MemoryInboxListParams = {
  status?: InboxStatus;
};

export type MemoryInboxListResult = {
  entries: MemoryInboxEntry[];
};

export type MemoryInboxApplyParams = {
  entryId: string;
  action: InboxAction;
};

export type MemoryInboxApplyResult = {
  entry: MemoryInboxEntry;
};

export type MemoryInboxUndoParams = {
  entryId: string;
};

export type MemoryInboxUndoResult = {
  entry: MemoryInboxEntry;
  restored: boolean;
};
