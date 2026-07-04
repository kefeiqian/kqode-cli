import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore } from 'jotai';
import type { BackendClientHandle } from '@backend/client/backendClient.ts';
import { startBackendRuntime } from '@backend/runtime/backendRuntime.ts';
import { resolveRepoRoot, resolveWorkspaceCwd } from '@libs/path/runtimePaths.ts';
import { PRODUCT_NAME } from '@constants/product.ts';
import { resolveProductVersion } from '@libs/product/productMetadata.ts';
import { setTerminalWindowTitle, resetTerminalWindowTitle } from '@libs/terminal/windowTitle.ts';
import {
  resetTerminalBackground,
  setTerminalBackground
} from '@libs/terminal/terminalBackground.ts';
import {
  enterAlternateScreen,
  leaveAlternateScreen
} from '@libs/terminal/alternateScreen.ts';
import { resolveSessionSeed } from '@components/exitSummary/resolveSessionSeed.ts';
import {
  productVersionAtom,
  repoRootAtom,
  sessionGitBaselineAtom,
  sessionStartedAtAtom,
  windowColumnsAtom,
  windowRowsAtom,
  workspaceCwdAtom
} from '@state/global/index.ts';
import { theme } from '@theme/themeConfig.ts';
import type { EmbeddedBackendAsset } from '@backend/packaged/materializeBackend.ts';

type Store = ReturnType<typeof createStore>;

/** Composed application runtime: the shared store plus a backend disposer. */
export type AppRuntime = {
  store: Store;
  dispose: () => void;
};

export type CreateAppRuntimeOptions = {
  /** Source-mode anchor used to locate the repo root; ignored in packaged mode. */
  entryUrl: string;
  /**
   * Packaged-only supplier of the embedded backend asset.
   *
   * The packaged entry injects this so the Bun-only embedding APIs
   * (`Bun.file`, `with { type: 'file' }`) stay out of the typechecked/test graph;
   * source mode never calls it.
   */
  loadPackagedAsset?: () => EmbeddedBackendAsset;
};

/**
 * Composes the TUI store and the environment-appropriate backend client.
 *
 * The `__PROD__` check is a build-time boolean (injected by Bun `--define` in the
 * packaged build, and by vitest / the dev shim otherwise): `if (__PROD__)` folds
 * at build time so the unused launch strategy is dead-code-eliminated — the Cargo
 * source-launch code is dropped from the packaged executable, and the packaged
 * client is never resolved outside `prod`. Each strategy is loaded with a dynamic
 * `import()` in its own branch; `dev` and `test` take the source path.
 *
 * `entryUrl` is the source-mode anchor used to locate the repo root for Cargo
 * and product metadata; it is ignored in the packaged (`prod`) build.
 */
export async function createAppRuntime({
  entryUrl,
  loadPackagedAsset
}: CreateAppRuntimeOptions): Promise<AppRuntime> {
  const store = createStore();
  const workspaceCwd = resolveWorkspaceCwd();
  store.set(workspaceCwdAtom, workspaceCwd);

  // Seed the live terminal size before the first render so the opening frame is
  // already full-size. `App` mirrors `process.stdout` into these atoms, but only
  // via a layout effect that runs *after* the first frame is committed — so
  // without this seed the first paint uses the DEFAULT_* fallback (80x24),
  // briefly rendering the UI at a fraction of a larger terminal before it snaps
  // to full size. We read the same source (and match the truthy guard) that
  // Ink's `useWindowSize` reads, so the effect's first write is a no-op; a
  // non-TTY stdout leaves these undefined and the derived atoms use DEFAULT_*.
  const { columns, rows } = process.stdout;
  if (columns) {
    store.set(windowColumnsAtom, columns);
  }
  if (rows) {
    store.set(windowRowsAtom, rows);
  }

  // Snapshot the session start time and git baseline at boot so the exit summary
  // can report real Duration and a working-tree Changes delta. Seeding here (not
  // in a state atom) keeps git shell-out out of the state layer.
  const seed = resolveSessionSeed({ cwd: workspaceCwd });
  store.set(sessionStartedAtAtom, seed.startedAt);
  store.set(sessionGitBaselineAtom, seed.baseline);

  let client: BackendClientHandle;
  let productVersion: string;
  if (__PROD__) {
    if (loadPackagedAsset === undefined) {
      throw new Error('packaged runtime requires an embedded backend asset loader');
    }
    productVersion = resolveProductVersion({});
    const { createPackagedBackendClient } = await import('@backend/client/packagedBackendClient.ts');
    client = createPackagedBackendClient({
      asset: loadPackagedAsset(),
      version: productVersion,
      workspaceCwd
    });
  } else {
    const repoRoot = resolveRepoRoot(path.dirname(fileURLToPath(entryUrl)));
    store.set(repoRootAtom, repoRoot);
    productVersion = resolveProductVersion({ repoRoot });
    const { createSourceBackendClient } = await import('@backend/client/sourceBackendClient.ts');
    client = createSourceBackendClient({ repoRoot, workspaceCwd });
  }

  store.set(productVersionAtom, productVersion);
  // Enter the alternate screen buffer before any visual setup so the session
  // renders in a scrollback-less buffer: while the TUI owns the screen the
  // terminal's native scrollbar has no pre-launch history to scroll into, and
  // the original buffer (with its scrollback) is restored on exit.
  enterAlternateScreen();
  setTerminalWindowTitle(PRODUCT_NAME, productVersion);
  setTerminalBackground(theme.colors.bodyBackground);

  const disposeBackend = startBackendRuntime(store, client);

  // Restore the user's terminal on clean shutdown and on hard exit (Ctrl+C /
  // crash) so neither the OSC 2 window title, the OSC 11 background override,
  // nor the alternate screen buffer outlives the session. The `exit` listener
  // is the safety net; `dispose` removes it on the clean path to avoid a
  // redundant restore. Mirror the enter order on teardown: reset the background
  // and window title, then leave the alt buffer.
  const restoreTerminal = () => {
    resetTerminalBackground();
    resetTerminalWindowTitle();
    leaveAlternateScreen();
  };
  process.once('exit', restoreTerminal);

  const dispose = () => {
    process.removeListener('exit', restoreTerminal);
    disposeBackend();
    restoreTerminal();
  };

  return { store, dispose };
}
