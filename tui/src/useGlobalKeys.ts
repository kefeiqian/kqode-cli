import { useApp, useInput } from 'ink';
import { useAtomValue, useSetAtom } from 'jotai';
import { ArmedAction } from '@constants/ui.ts';
import { armedActionAtom } from '@state/ui/index.ts';

/**
 * Global key handling that stays active in every state — the home screen, the
 * too-small notice, and while composer input is locked. Owns Ctrl+C as a
 * two-step exit: the first press arms `'exit'` (the status bar shows the hint),
 * the second calls Ink's `exit`, which runs the same teardown as `/exit`.
 * Any non-Ctrl+C key except Esc disarms a pending exit globally, so the arm
 * cannot persist across help or too-small screens where the composer is absent.
 *
 * Requires `exitOnCtrlC: false` on the Ink render so Ctrl+C reaches here as the
 * `\x03` byte instead of exiting immediately. The composer input hook ignores
 * Ctrl+C, so it is handled here exactly once.
 */
export function useGlobalKeys(): void {
  const { exit } = useApp();
  const armedAction = useAtomValue(armedActionAtom);
  const setArmedAction = useSetAtom(armedActionAtom);

  useInput((input, key) => {
    const isCtrlC = key.ctrl === true && input === 'c';
    if (!isCtrlC) {
      // A pending two-step exit clears on any other key, in every screen (the
      // composer dispatcher only runs on the home screen). Esc and the
      // ClearInput arm are owned by the composer, so leave them untouched here
      // to avoid racing that handler when both useInputs fire on one key.
      if (key.escape !== true && armedAction === ArmedAction.Exit) {
        setArmedAction(null);
      }
      return;
    }

    if (armedAction === ArmedAction.Exit) {
      setArmedAction(null);
      exit();
    } else {
      setArmedAction(ArmedAction.Exit);
    }
  });
}
