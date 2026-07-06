import { createBackendClient, type BackendClientHandle } from '@backend/client/backendClient.ts';
import { launchSourceBackend } from '@backend/process/backendProcess.ts';

/** Source/dev composition inputs: build from `repoRoot`, then run in `workspaceCwd`. */
export type SourceBackendClientOptions = {
  /** Repo root the backend binary is built from via Cargo. */
  repoRoot: string;
  /** Workspace directory the backend process runs in. */
  workspaceCwd: string;
  requestTimeoutMs?: number;
  validationRequestTimeoutMs?: number;
};

/**
 * Creates a backend client that builds the Rust backend from source with Cargo.
 *
 * This is the developer path. It keeps the Cargo build/launch wiring out of the
 * generic {@link createBackendClient} so the packaged build can tree-shake it.
 */
export function createSourceBackendClient(options: SourceBackendClientOptions): BackendClientHandle {
  const { repoRoot, workspaceCwd, requestTimeoutMs, validationRequestTimeoutMs } = options;
  return createBackendClient({
    launch: () => launchSourceBackend({ repoRoot, workspaceCwd }),
    requestTimeoutMs,
    validationRequestTimeoutMs
  });
}
