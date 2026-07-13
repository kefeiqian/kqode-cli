import { useApp, useInput } from 'ink';
import { useStore } from 'jotai';
import { ArmedAction } from '@constants/ui.ts';
import { copySelection } from '@components/HomeScreen/copySelection.ts';
import {
  isCtrlCShortcut,
  isSelectionCopyShortcut
} from '@libs/keyboard/clipboardShortcuts.ts';
import { isMouseInput } from '@libs/terminal/mouse.ts';
import { armedActionAtom, bodySelectionAtom, clearBodySelectionAtom } from '@state/ui/index.ts';

/**
 * Global key handling that stays active in every state — the home screen, the
 * too-small notice, and while composer input is locked. Owns Ctrl+C as a
 * two-step exit: the first press arms `'exit'` (the status bar shows the hint),
 * the second calls Ink's `exit`, which runs the same teardown as `/exit`.
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

    if (armedAction === ArmedAction.Exit) {
      store.set(armedActionAtom, null);
      exit();
    } else {
      store.set(armedActionAtom, ArmedAction.Exit);
    }
  });
}
