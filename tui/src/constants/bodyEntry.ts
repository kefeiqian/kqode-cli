/**
 * Kinds of body-pane transcript entries. Each kind drives how `resolveBodyRows`
 * renders the entry (prefix, color, and label) and which queue/command outcome
 * produced it. Referenced instead of the raw strings so the body renderer, the
 * prompt queue, and the command dispatcher stay in sync and searchable.
 */
export const BodyEntryKind = {
  /** A submitted user prompt, rendered in a padded message block. */
  User: 'user',
  /** An assistant/agent reply. */
  Assistant: 'assistant',
  /** A queued prompt awaiting execution. */
  Pending: 'pending',
  /** A successful command or backend result. */
  Success: 'success',
  /** Non-error guidance emitted by the client or backend. */
  System: 'system',
  /** A failed command or backend result. */
  Error: 'error',
  /** A muted non-error terminal result, such as a cancelled backend turn. */
  Muted: 'muted'
} as const;

export type BodyEntryKind = (typeof BodyEntryKind)[keyof typeof BodyEntryKind];
