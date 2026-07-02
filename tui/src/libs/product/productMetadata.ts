import fs from 'node:fs';
import path from 'node:path';

const CARGO_VERSION_PATTERN = /^\s*version\s*=\s*"([^"]+)"/m;

export function readProductVersion(repoRoot: string): string {
  const manifestPath = path.join(repoRoot, 'Cargo.toml');
  const manifest = fs.readFileSync(manifestPath, 'utf8');
  const match = CARGO_VERSION_PATTERN.exec(manifest);

  if (match === null) {
    throw new Error(`Could not read KQode version from ${manifestPath}`);
  }

  return match[1];
}

/**
 * Resolves the displayed product version for the active distribution.
 *
 * Packaged builds inject `process.env.KQODE_VERSION` via Bun `--define`; source
 * mode reads it from the Cargo manifest under `repoRoot`. An empty injected
 * value is ignored so a missing `--define` cannot blank the version.
 *
 * # Errors
 *
 * Throws when no injected version is present and `repoRoot` is omitted, or when
 * the manifest read fails in source mode.
 */
export function resolveProductVersion(options: { repoRoot?: string }): string {
  const injected = process.env.KQODE_VERSION;
  if (injected !== undefined && injected.length > 0) {
    return injected;
  }
  if (options.repoRoot === undefined) {
    throw new Error('product version requires a repo root when no build-time version is injected');
  }
  return readProductVersion(options.repoRoot);
}
