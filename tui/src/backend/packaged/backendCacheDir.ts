import os from 'node:os';
import path from 'node:path';

/** Per-user KQode home directory holding local runtime/data state. */
export const KQODE_HOME_DIRNAME = '.kqode';

/** Subdirectory under the KQode home for materialized backend binaries. */
export const BACKENDS_DIRNAME = 'backends';

/** Base name of the materialized packaged backend binary. */
export const PACKAGED_BACKEND_BASENAME = 'kqode-backend';

/** Default per-user cache base, e.g. `~/.kqode`. */
export function defaultCacheBaseDir(homeDir: string = os.homedir()): string {
  return path.join(homeDir, KQODE_HOME_DIRNAME);
}

/** Platform-correct file name for the materialized backend binary. */
export function packagedBackendBinaryName(platform: NodeJS.Platform = process.platform): string {
  return platform === 'win32' ? `${PACKAGED_BACKEND_BASENAME}.exe` : PACKAGED_BACKEND_BASENAME;
}

export type PackagedBackendPaths = {
  /** Content-addressed directory, e.g. `~/.kqode/backends/0.1.0/<sha256>`. */
  runtimeDir: string;
  /** Absolute path to the materialized backend binary inside `runtimeDir`. */
  binaryPath: string;
};

/**
 * Resolves the per-user paths the packaged backend materializes into.
 *
 * The cache is content-addressed: the `version` segment groups builds for human
 * readability, and the `sha256` segment keys the actual binary by content. Two
 * builds with different backends (even at the same version) therefore live in
 * separate directories, so a new executable never rewrites — or contends with a
 * still-running instance over — a differing sibling's materialized binary.
 */
export function resolvePackagedBackendPaths(options: {
  version: string;
  sha256: string;
  cacheBaseDir?: string;
  platform?: NodeJS.Platform;
}): PackagedBackendPaths {
  const {
    version,
    sha256,
    cacheBaseDir = defaultCacheBaseDir(),
    platform = process.platform
  } = options;
  const runtimeDir = path.join(cacheBaseDir, BACKENDS_DIRNAME, version, sha256);
  return { runtimeDir, binaryPath: path.join(runtimeDir, packagedBackendBinaryName(platform)) };
}
