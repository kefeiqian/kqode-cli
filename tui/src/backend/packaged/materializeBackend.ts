import fs from 'node:fs';
import {
  ensureRuntimeDir,
  inspectExisting,
  materializationError,
  sha256Hex,
  writeBinary
} from '@backend/packaged/backendCacheWrite.ts';
import { resolvePackagedBackendPaths } from '@backend/packaged/backendCacheDir.ts';

/**
 * The Rust backend binary embedded in the packaged executable.
 *
 * `readBytes` is injected so the materialization logic stays runtime-agnostic:
 * the packaging build supplies a Bun-embedded-file reader, while tests supply a
 * fake. `sha256` is the lowercase hex digest injected at build time
 * (`KQODE_BACKEND_SHA256`) and is the integrity anchor for every spawn.
 */
export type EmbeddedBackendAsset = {
  readBytes(): Promise<Buffer>;
  readonly sha256: string;
};

export type MaterializeBackendOptions = {
  asset: EmbeddedBackendAsset;
  version: string;
  cacheBaseDir?: string;
  platform?: NodeJS.Platform;
};

/** Injectable seams for deterministic tests of the concurrent-write path. */
export type MaterializeBackendDeps = {
  writeBinary?: typeof writeBinary;
};

/**
 * Materializes the embedded backend into the per-user cache and returns its path.
 *
 * The cache is content-addressed (`backends/<version>/<sha256>/`): an
 * already-materialized binary whose SHA-256 matches is reused as-is; otherwise
 * the embedded bytes are written with create-new + atomic-replace semantics and
 * user-only permissions. The asset bytes are integrity-checked against the
 * embedded digest before being written, and the on-disk result is re-verified
 * before the path is returned, so a corrupt asset or a tampered cache fails
 * closed.
 *
 * Concurrency: because the path is keyed by content, a different backend build
 * never targets the same file as a running one. For the narrow case of two
 * instances of the *same* build racing a first-ever write (where the loser's
 * write can fail against the winner's freshly created — and, on Windows, locked
 * — file), the loser falls back to the winner's now-valid binary instead of
 * failing.
 *
 * # Errors
 *
 * Throws a `launch`-kind {@link BackendClientError} when the cache path is a
 * symlink/irregular file, the asset fails its integrity check, or filesystem
 * operations fail without a valid binary being present.
 */
export async function materializePackagedBackend(
  options: MaterializeBackendOptions,
  deps: MaterializeBackendDeps = {}
): Promise<string> {
  const { asset, version, cacheBaseDir, platform = process.platform } = options;
  const write = deps.writeBinary ?? writeBinary;
  const { runtimeDir, binaryPath } = resolvePackagedBackendPaths({
    version,
    sha256: asset.sha256,
    cacheBaseDir,
    platform
  });

  if (inspectExisting(binaryPath, asset.sha256, platform) === 'reusable') {
    return binaryPath;
  }

  const bytes = await asset.readBytes();
  const actualSha = sha256Hex(bytes);
  if (actualSha !== asset.sha256) {
    throw materializationError(
      `embedded asset integrity check failed (expected ${asset.sha256}, got ${actualSha})`
    );
  }

  ensureRuntimeDir(runtimeDir, platform);
  try {
    write(binaryPath, runtimeDir, bytes, platform);
    if (sha256Hex(fs.readFileSync(binaryPath)) !== asset.sha256) {
      throw materializationError('post-write integrity check failed');
    }
    return binaryPath;
  } catch (error) {
    // A concurrent instance of the same build may have materialized (and, on
    // Windows, locked) the identical binary between our inspect and our write —
    // or replaced it in the brief atomic-replace gap our post-write read-back
    // observed. Defer to it when the cache is now valid instead of failing the
    // launch; genuine corruption leaves the cache invalid and still throws.
    if (inspectExisting(binaryPath, asset.sha256, platform) === 'reusable') {
      return binaryPath;
    }
    throw error;
  }
}
