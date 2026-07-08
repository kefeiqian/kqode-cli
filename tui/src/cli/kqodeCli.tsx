import { defineCommand, runMain } from 'citty';
import { render } from 'ink';
import { Provider } from 'jotai';
import type { EmbeddedBackendAsset } from '@backend/packaged/materializeBackend.ts';
import { App } from '@/App.tsx';
import { buildKqodeMeta } from '@/cli/meta.ts';
import { createAppRuntime } from '@/bootstrap.ts';
import { finishSession } from '@components/AppExitSummary/finishSession.ts';
import { KQODE_DEBUG_ENV_VAR } from '@constants/backend.ts';

/** Inputs for the root CLI command; `loadPackagedAsset` is supplied only in packaged mode. */
export type RunKqodeCliOptions = {
  /** Source-mode anchor used to locate the repo root; ignored in packaged mode. */
  entryUrl: string;
  /** Packaged-only supplier of the embedded backend asset. */
  loadPackagedAsset?: () => EmbeddedBackendAsset;
};

/** Composes the runtime, renders the Ink app, and prints the exit summary on teardown. */
async function launchTui({ entryUrl, loadPackagedAsset }: RunKqodeCliOptions): Promise<void> {
  const { store, dispose } = await createAppRuntime({ entryUrl, loadPackagedAsset });

  const { waitUntilExit } = render(
    <Provider store={store}>
      <App />
    </Provider>,
    // Keep Ink's incremental diffing on. With FULLSCREEN_GUARD_ROWS at 0 the
    // frame now fills the full viewport height; Windows Terminal presents the
    // fullscreen repaint path atomically, so we can reclaim the last row.
    // exitOnCtrlC is off so Ctrl+C flows to the global two-step-exit handler
    // (useGlobalKeys) instead of quitting on the first press.
    { incrementalRendering: true, exitOnCtrlC: false }
  );

  // Restore the terminal, then print the exit summary card into the recovered
  // scrollback. Shared by both entries so exit behavior can't drift.
  await waitUntilExit().finally(() => finishSession({ store, dispose }));
}

/**
 * The root `kqode` command. Running it with no subcommand launches the TUI;
 * citty answers `--help` / `-h` and `--version` / `-v` from the metadata. Extend
 * the CLI by adding global flags under `args` and subcommands under
 * `subCommands`.
 *
 * `--debug` turns on backend request/response logging to `~/.kqode/logs/` by
 * setting {@link KQODE_DEBUG_ENV_VAR} for the spawned backend (which is
 * allowlisted through the hardened child env). Logging is already on by default
 * in dev builds; the flag is the opt-in for packaged builds.
 */
export function createKqodeCommand(options: RunKqodeCliOptions) {
  return defineCommand({
    meta: buildKqodeMeta({ entryUrl: options.entryUrl }),
    args: {
      debug: {
        type: 'boolean',
        description: 'Log LLM request/response transcripts to ~/.kqode/logs/',
        default: false
      }
    },
    run: ({ args }) => {
      if (args.debug) {
        process.env[KQODE_DEBUG_ENV_VAR] = '1';
      }
      return launchTui(options);
    }
  });
}

/** Parses argv, answers `--help` / `--version`, or launches the TUI. */
export function runKqodeCli(options: RunKqodeCliOptions): Promise<void> {
  return runMain(createKqodeCommand(options));
}
