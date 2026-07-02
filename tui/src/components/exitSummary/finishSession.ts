import type { createStore } from 'jotai';
import { printExitSummary } from '@components/exitSummary/printExitSummary.ts';

type Store = ReturnType<typeof createStore>;

export type FinishSessionDeps = {
  store: Store;
  dispose: () => void;
};

/**
 * Tears the app down and prints the exit summary card, in that order.
 *
 * `dispose` restores the terminal — resetting the background and leaving the
 * alternate screen — so the card that {@link printExitSummary} writes next lands
 * in the user's restored scrollback with the shell prompt below it. Both
 * composition-root entry points (source `main.tsx` and the packaged binary
 * entry) call this from `waitUntilExit().finally(...)` so the exit behavior
 * cannot drift between them.
 */
export function finishSession({ store, dispose }: FinishSessionDeps): void {
  dispose();
  printExitSummary({ store });
}
