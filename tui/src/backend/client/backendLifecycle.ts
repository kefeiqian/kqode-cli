/** Lifecycle of the TUI-owned backend connection. */
export const BackendLifecycleState = {
  /** No backend has been launched yet. */
  Idle: 'idle',
  /** A backend launch/connect is in flight. */
  Starting: 'starting',
  /** The backend is connected and accepting requests. */
  Ready: 'ready',
  /** The TUI is disposing the backend on purpose. */
  Closing: 'closing',
  /** The backend exited, crashed, or a fatal transport error occurred. */
  Dead: 'dead'
} as const;

export type BackendLifecycleState =
  (typeof BackendLifecycleState)[keyof typeof BackendLifecycleState];
