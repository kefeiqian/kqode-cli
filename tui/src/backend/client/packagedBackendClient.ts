import { createBackendClient, type BackendClientHandle } from '@backend/client/backendClient.ts';
import { launchPackagedBackend } from '@backend/packaged/launchPackagedBackend.ts';
import type { EmbeddedBackendAsset } from '@backend/packaged/materializeBackend.ts';

/** Packaged/dist composition inputs: run the embedded backend in `workspaceCwd`. */
export type PackagedBackendClientOptions = {
  /** Embedded Rust backend asset plus its build-time integrity digest. */
  asset: EmbeddedBackendAsset;
  /** Product version selecting the versioned cache directory. */
  version: string;
  /** Workspace directory the materialized backend process runs in. */
  workspaceCwd: string;
  cacheBaseDir?: string;
  requestTimeoutMs?: number;
};

/**
 * Creates a backend client backed by the Rust binary embedded in the standalone
 * executable.
 *
 * Each launch materializes and integrity-verifies the embedded backend before
 * spawning it (see {@link launchPackagedBackend}); no Cargo build is involved.
 * A materialization or spawn failure surfaces as a fail-closed `launch` error.
 */
export function createPackagedBackendClient(
  options: PackagedBackendClientOptions
): BackendClientHandle {
  return createBackendClient({
    launch: (nextWorkspaceCwd) =>
      launchPackagedBackend({
        asset: options.asset,
        version: options.version,
        workspaceCwd: nextWorkspaceCwd ?? options.workspaceCwd,
        cacheBaseDir: options.cacheBaseDir
      }),
    initialWorkspaceCwd: options.workspaceCwd,
    requestTimeoutMs: options.requestTimeoutMs
  });
}
