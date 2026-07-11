import { atom } from 'jotai';

/**
 * Whether in-app selection mode is active. Entered with `Ctrl+R`; while active,
 * mouse press/drag/release build a transcript selection (rendered by `BodyPane`),
 * release copies it to the clipboard, body scroll keys and the wheel still
 * scroll, and any other key exits. The mouse stays captured either way — the
 * selection is drawn and copied in-app rather than delegated to the terminal.
 */
export const copyModeActiveAtom = atom(false);
