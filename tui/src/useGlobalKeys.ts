import { useApp, useInput } from 'ink';
import { useAtomValue, useSetAtom } from 'jotai';
import { armedActionAtom } from '@state/global/index.ts';

/**
 * Global key handling that stays active in every state — the home screen, the
 * too-small notice, and while composer input is locked. Owns Ctrl+C as a
 * two-step exit: the first press arms `'exit'` (the status bar shows the hint),
 * the second calls Ink's `exit`, which runs the same teardown as `/exit`.
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
    if (key.ctrl !== true || input !== 'c') {
      return;
    }

    if (armedAction === 'exit') {
      setArmedAction(null);
      exit();
    } else {
      setArmedAction('exit');
    }
  });
}
