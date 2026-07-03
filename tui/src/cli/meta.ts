import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLI_NAME } from '@constants/product.ts';
import { resolveRepoRoot } from '@libs/path/runtimePaths.ts';
import { resolveProductVersion } from '@libs/product/productMetadata.ts';

/** One-line CLI description shown in `--help` usage. */
const CLI_DESCRIPTION =
  'KQode — a Rust-core coding-agent harness with a TypeScript Ink terminal UI.';

/** citty command metadata: the `name`, `version`, and `description`. */
export type KqodeMeta = {
  name: string;
  version: string;
  description: string;
};

/**
 * Builds the root citty command metadata.
 *
 * citty derives the built-in `--version` / `-v` and `--help` / `-h` flags from
 * this, so the version resolution matches `createAppRuntime`: the packaged build
 * reads the build-injected version, and source mode reads the Cargo manifest
 * under the repo root derived from `entryUrl`.
 */
export function buildKqodeMeta({ entryUrl }: { entryUrl: string }): KqodeMeta {
  const version = __PROD__
    ? resolveProductVersion({})
    : resolveProductVersion({ repoRoot: resolveRepoRoot(path.dirname(fileURLToPath(entryUrl))) });

  return { name: CLI_NAME, version, description: CLI_DESCRIPTION };
}
