import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { BunPlugin } from 'bun';
import { exeSuffix, parseArgs, resolveProductVersion } from './scriptUtils.ts';
import { BACKEND_SHA256_ENV_VAR, VERSION_ENV_VAR } from '../src/constants/env.ts';

/**
 * Builds the self-contained packaged `kqode` executable with Bun.
 *
 * Stages the prebuilt Rust backend as an embeddable asset, computes its
 * SHA-256, then runs `Bun.build({ compile })` on the packaged entry, injecting
 * the distribution mode, product version, and backend digest as build-time
 * constants. The Rust backend is NOT built here — pass `--backend=<path>` or
 * build `target/release/kqode` first (the `cargo xtask package` wrapper does
 * this). This script is the reusable implementation that wrapper delegates to.
 */

const tuiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(tuiRoot, '..');

// Ink imports the optional `react-devtools-core` inside a `process.env.DEV ===
// 'true'` branch that never runs in the packaged binary, and the package is not
// installed. Bun matches `--define` only on dot access, not Ink's bracket
// access, so the branch cannot be DCE'd; instead resolve the dependency to an
// empty stub. The runtime DEV guard ensures the stub is never evaluated.
const stubReactDevtools: BunPlugin = {
  name: 'stub-react-devtools-core',
  setup(build): void {
    build.onResolve({ filter: /^react-devtools-core$/ }, () => ({
      path: 'react-devtools-core',
      namespace: 'kqode-stub'
    }));
    build.onLoad({ filter: /.*/, namespace: 'kqode-stub' }, () => ({
      contents: 'export default {};',
      loader: 'js'
    }));
  }
};

function stageBackend(backendSource: string): { stagedPath: string; sha256: string } {
  if (!fs.existsSync(backendSource)) {
    throw new Error(
      `Rust backend not found at ${backendSource}; build it with \`cargo build --release --bin kqode\` or pass --backend=<path>`
    );
  }
  const assetsDir = path.join(tuiRoot, 'packaged', 'assets');
  fs.mkdirSync(assetsDir, { recursive: true });
  const stagedPath = path.join(assetsDir, 'kqode-backend');
  fs.copyFileSync(backendSource, stagedPath);

  const sha256 = createHash('sha256').update(fs.readFileSync(stagedPath)).digest('hex');
  return { stagedPath, sha256 };
}

async function compile(version: string, sha256: string, outBase: string): Promise<string> {
  const distDir = path.dirname(outBase);
  fs.mkdirSync(distDir, { recursive: true });
  const entry = path.join(tuiRoot, 'packaged', 'entry.packaged.tsx');

  const result = await Bun.build({
    entrypoints: [entry],
    minify: true,
    define: {
      __PROD__: 'true',
      __TEST__: 'false',
      __DEV__: 'false',
      ['process.env.' + VERSION_ENV_VAR]: JSON.stringify(version),
      ['process.env.' + BACKEND_SHA256_ENV_VAR]: JSON.stringify(sha256)
    },
    plugins: [stubReactDevtools],
    compile: { outfile: outBase }
  });

  if (!result.success) {
    const detail = result.logs.map((entry) => String(entry.message ?? entry)).join('\n');
    throw new Error(`bun build --compile failed:\n${detail}`);
  }
  return `${outBase}${exeSuffix}`;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const backendSource =
    args.get('backend') ?? path.join(repoRoot, 'target', 'release', `kqode${exeSuffix}`);
  const version = args.get('version') ?? resolveProductVersion({ repoRoot });
  const outBase = args.get('out') ?? path.join(tuiRoot, 'dist', 'kqode');

  const { sha256 } = stageBackend(backendSource);
  const outfile = await compile(version, sha256, outBase);

  console.log(`Packaged ${outfile} (version ${version}, backend sha256 ${sha256.slice(0, 12)}…)`);
}

await main();
