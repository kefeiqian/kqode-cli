import type { Key } from 'ink';
import type { createStore } from 'jotai';
import type { CommandActions } from '@libs/commands/executeCommand.ts';

/** The Jotai store handlers read and write through (`store.get`/`store.set`). */
type Store = ReturnType<typeof createStore>;

/** The composer text buffer snapshot a key handler reads. */
export type ComposerInputState = {
  cursorIndex: number;
  text: string;
};

/**
 * Everything a composer key handler needs to resolve one keypress. Reads and
 * writes go through `store`, so each handler declares the atoms it touches by its
 * own imports — there is no shared setter bag to thread through this type.
 */
export type ComposerKeyContext = {
  input: string;
  key: Key;
  state: ComposerInputState;
  maxBytes: number;
  onSubmit: (prompt: string, submissionSequence?: number) => void;
  commandActions: CommandActions;
  store: Store;
};

/**
 * One branch of the composer's single `useInput` dispatcher. Returns `true` when
 * it consumed the key so the dispatcher stops, or `false` to let the next handler
 * try. Keeping a single dispatcher is deliberate: Ink has no event propagation,
 * so a second `useInput` would receive every key and double-handle it.
 */
export type ComposerKeyHandler = (context: ComposerKeyContext) => boolean;
