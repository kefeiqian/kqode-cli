import type { BackendClient } from '@contracts/backend/index.ts';
import type { LaunchedBackend } from '@backend/process/backendProcess.ts';

/** Lifecycle of the TUI-owned backend connection. */
export const BackendLifecycleState = {
  Idle: 'idle',
  Starting: 'starting',
  Ready: 'ready',
  Closing: 'closing',
  Dead: 'dead'
} as const;

export type BackendLifecycleState =
  (typeof BackendLifecycleState)[keyof typeof BackendLifecycleState];

/** Lifecycle handle over a {@link BackendClient} that owns one child backend at a time. */
export type BackendClientHandle = BackendClient & {
  getState(): BackendLifecycleState;
  onReady(listener: (sessionId: string) => void): void;
  ensureStarted(): Promise<void>;
  dispose(): void;
};

/** Composition inputs for the generic backend client: an injected process launcher. */
export type BackendClientOptions = {
  launch: () => Promise<LaunchedBackend>;
  requestTimeoutMs?: number;
  startupTimeoutMs?: number;
};
