import { useApp, useInput } from 'ink';
import { useStore } from 'jotai';
import { ArmedAction } from '@constants/ui.ts';
import { copySelection } from '@components/HomeScreen/copySelection.ts';
import {
  isCtrlCShortcut,
  isModifierOnlyKeyEvent,
  isSelectionCopyShortcut
} from '@libs/keyboard/clipboardShortcuts.ts';
import { isMouseInput } from '@libs/terminal/mouse.ts';
import {
  activeSurfaceAtom,
  armedActionAtom,
  bodySelectionAtom,
  clearBodySelectionAtom,
  Surface,
  terminalTooSmallAtom
} from '@state/ui/index.ts';
import { clearComposerAtom, composerStateAtom } from '@state/ui/composer/index.ts';
import { backendClientAtom } from '@state/global/index.ts';
import { activeTurnIdAtom } from '@state/promptQueue/index.ts';

/**
 * Global key handling that stays active in every state — the home screen, the
 * too-small notice, and while composer input is locked. Owns Ctrl+C: on the home
 * screen a first press with composer text clears the composer (empty the input
 * line first, matching the common terminal convention); otherwise it is a
 * two-step exit — the first press arms `'exit'` (the status bar shows the hint),
 * the second calls Ink's `exit`, which runs the same teardown as `/exit`.
 * While a turn is streaming, Ctrl+C instead stops it (cancels the running turn
 * and clears the pending queue → idle) and consumes the key, taking precedence
 * over the exit/clear behavior; ESC keeps its own cancel-active-only path.
 * Any non-Ctrl+C key except Esc disarms a pending exit globally, so the arm
 * cannot persist across help or too-small screens where the composer is absent.
 *
 * Also handles active transcript selections: copy shortcuts consume the key by
 * copying through the same path as right-click and dismissing the highlight.
 * Other keys still dismiss the highlight without consuming the key, so normal
 * key actions continue. Body-scroll keys keep the highlight so a highlighted
 * transcript can still scroll, and mouse input passes through untouched because
 * the home-screen router owns clicks, drags, and right-click dismissal.
 *
 * Requires `exitOnCtrlC: false` on the Ink render so Ctrl+C reaches here as the
 * `\x03` byte instead of exiting immediately. The composer input hook ignores
 * Ctrl+C, so it is handled here exactly once.
 */
export function useGlobalKeys(): void {
  const { exit } = useApp();
  const store = useStore();

  useInput((input, key) => {
    const bodySelection = store.get(bodySelectionAtom);
    const armedAction = store.get(armedActionAtom);
    const isCtrlC = isCtrlCShortcut(input, key);

    if (isModifierOnlyKeyEvent(input, key)) {
      return;
    }

    if (
      bodySelection !== null &&
      isSelectionCopyShortcut(input, key) &&
      copySelection(store)
    ) {
      store.set(clearBodySelectionAtom);
      if (armedAction !== null) {
        store.set(armedActionAtom, null);
      }
      return;
    }

    // Dismiss an active highlight on any key press without returning, so the key
    // still performs its normal action (non-consuming dismissal). Body-scroll
    // keys keep the highlight, and mouse input is owned by the home-screen router
    // (clicks/drags/right-click), so neither dismisses here. Esc dismisses too —
    // the clear side effect runs while the composer keeps owning Esc's own action.
    if (
      bodySelection !== null &&
      key.pageUp !== true &&
      key.pageDown !== true &&
      key.end !== true &&
      !isMouseInput(input)
    ) {
      store.set(clearBodySelectionAtom);
    }

    if (!isCtrlC) {
      // A pending two-step exit clears on any other key, in every screen (the
      // composer dispatcher only runs on the home screen). Esc and the
      // ClearInput arm are owned by the composer, so leave them untouched here
      // to avoid racing that handler when both useInputs fire on one key.
      if (key.escape !== true && armedAction === ArmedAction.Exit) {
        store.set(armedActionAtom, null);
      }
      return;
    }

    // Past this point the key is Ctrl+C with no active transcript selection.
    // While a turn is streaming, Ctrl+C stops it: cancel the running turn and
    // clear the pending queue backend-side (both arrive as transcript events),
    // so one press lands idle. Consume the key — no exit arm, no composer clear,
    // and the composer draft is left intact. This keys on the active turn, not
    // the surface, so it also fires under a docked command surface (which stays
    // open) or the too-small notice; ESC keeps its own cancel-active-only path.
    if (store.get(activeTurnIdAtom) !== null) {
      void store
        .get(backendClientAtom)
        ?.stopTurn()
        .catch(() => undefined);
      if (armedAction !== null) {
        store.set(armedActionAtom, null);
      }
      return;
    }

    if (armedAction === ArmedAction.Exit) {
      store.set(armedActionAtom, null);
      exit();
      return;
    }

    // First Ctrl+C clears a non-empty composer instead of arming exit, matching
    // the common terminal convention (empty the input line first, then two-step
    // exit). Scoped to the home screen composer being the active editable
    // surface: a docked command surface leaves the composer empty and the
    // too-small notice unmounts it, so those states keep pure exit arming. Any
    // pending Esc clear-input arm is dropped so its status hint clears too.
    const composerIsActiveInputSurface =
      store.get(activeSurfaceAtom) === Surface.Home && !store.get(terminalTooSmallAtom);
    if (composerIsActiveInputSurface && store.get(composerStateAtom).text.length > 0) {
      store.set(clearComposerAtom);
      if (armedAction !== null) {
        store.set(armedActionAtom, null);
      }
      return;
    }

    store.set(armedActionAtom, ArmedAction.Exit);
  });
}
