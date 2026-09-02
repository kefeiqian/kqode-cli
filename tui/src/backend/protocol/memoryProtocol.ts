import { RequestType, RequestType0 } from 'vscode-jsonrpc';
import {
  MEMORY_ADD_METHOD,
  MEMORY_EDIT_METHOD,
  MEMORY_FORGET_METHOD,
  MEMORY_INBOX_APPLY_METHOD,
  MEMORY_INBOX_LIST_METHOD,
  MEMORY_INBOX_UNDO_METHOD,
  MEMORY_LIST_METHOD,
  MEMORY_RELOAD_METHOD,
  MEMORY_SHOW_METHOD
} from '@contracts/backend/index.ts';
import type {
  MemoryAddParams,
  MemoryEditParams,
  MemoryForgetParams,
  MemoryForgetResult,
  MemoryInboxApplyParams,
  MemoryInboxApplyResult,
  MemoryInboxListParams,
  MemoryInboxListResult,
  MemoryInboxUndoParams,
  MemoryInboxUndoResult,
  MemoryListParams,
  MemoryListResult,
  MemoryMutationResult,
  MemoryShowParams,
  MemoryShowResult
} from '@contracts/backend/index.ts';

/** Typed descriptor for `kqode.memory.list`. */
export const memoryListRequest = new RequestType<MemoryListParams, MemoryListResult, void>(
  MEMORY_LIST_METHOD
);

/** Typed descriptor for `kqode.memory.show`. */
export const memoryShowRequest = new RequestType<MemoryShowParams, MemoryShowResult, void>(
  MEMORY_SHOW_METHOD
);

/** Typed descriptor for `kqode.memory.add`. */
export const memoryAddRequest = new RequestType<MemoryAddParams, MemoryMutationResult, void>(
  MEMORY_ADD_METHOD
);

/** Typed descriptor for `kqode.memory.edit`. */
export const memoryEditRequest = new RequestType<MemoryEditParams, MemoryMutationResult, void>(
  MEMORY_EDIT_METHOD
);

/** Typed descriptor for `kqode.memory.forget`. */
export const memoryForgetRequest = new RequestType<MemoryForgetParams, MemoryForgetResult, void>(
  MEMORY_FORGET_METHOD
);

/** Typed descriptor for the parameterless `kqode.memory.reload`. */
export const memoryReloadRequest = new RequestType0<MemoryListResult, void>(MEMORY_RELOAD_METHOD);

/** Typed descriptor for `kqode.memory.inbox.list`. */
export const memoryInboxListRequest = new RequestType<
  MemoryInboxListParams,
  MemoryInboxListResult,
  void
>(MEMORY_INBOX_LIST_METHOD);

/** Typed descriptor for `kqode.memory.inbox.apply`. */
export const memoryInboxApplyRequest = new RequestType<
  MemoryInboxApplyParams,
  MemoryInboxApplyResult,
  void
>(MEMORY_INBOX_APPLY_METHOD);

/** Typed descriptor for `kqode.memory.inbox.undo`. */
export const memoryInboxUndoRequest = new RequestType<
  MemoryInboxUndoParams,
  MemoryInboxUndoResult,
  void
>(MEMORY_INBOX_UNDO_METHOD);
