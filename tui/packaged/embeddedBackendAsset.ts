import backendAssetPath from './assets/kqode-backend' with { type: 'file' };
import type { EmbeddedBackendAsset } from '@backend/packaged/materializeBackend.ts';

/**
 * Embedded Rust backend asset for the packaged executable.
 *
 * `bun build --compile` embeds the staged Rust binary referenced by the
 * `with { type: 'file' }` import, and `--define` inlines its digest into
 * `process.env.KQODE_BACKEND_SHA256`. This module lives outside `src/` on
 * purpose: it uses Bun-only APIs (`Bun.file`, the file import attribute) that
 * tsc and Vitest must never resolve, and it is referenced only by the packaged
 * entry, never by the source/dev graph.
 *
 * The digest is read through the literal `process.env.KQODE_BACKEND_SHA256` so
 * Bun's `--define` can inline it (an imported constant would not be replaced).
 */
export function loadEmbeddedBackendAsset(): EmbeddedBackendAsset {
  return {
    sha256: process.env.KQODE_BACKEND_SHA256 ?? '',
    readBytes: async () => Buffer.from(await Bun.file(backendAssetPath).bytes())
  };
}
