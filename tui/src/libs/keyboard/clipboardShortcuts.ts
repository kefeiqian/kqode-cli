import { PASTE_INPUT_KEY } from '@constants/ui.ts';

type SelectionCopyKey = {
  ctrl?: boolean;
  meta?: boolean;
  super?: boolean;
};

const COPY_INPUT = 'c';

/** Returns whether the key event is the universal `Ctrl+C` shortcut. */
export function isCtrlCShortcut(input: string, key: SelectionCopyKey): boolean {
  return input === COPY_INPUT && key.ctrl === true;
}

/**
 * Returns whether a key event should copy the active transcript selection.
 * `Ctrl+C` is universal; macOS also accepts forwarded Command forms.
 */
export function isSelectionCopyShortcut(
  input: string,
  key: SelectionCopyKey,
  platform?: NodeJS.Platform
): boolean {
  if (isCtrlCShortcut(input, key)) {
    return true;
  }

  if (input !== COPY_INPUT || (key.super !== true && key.meta !== true)) {
    return false;
  }

  return (platform ?? process.platform) === 'darwin';
}

/**
 * Returns whether a key event should paste from the system clipboard.
 * `Ctrl+V` and terminal-forwarded `Alt+V` are universal; macOS also accepts
 * forwarded Command forms.
 */
export function isClipboardPasteShortcut(
  input: string,
  key: SelectionCopyKey,
  platform?: NodeJS.Platform
): boolean {
  if (input !== PASTE_INPUT_KEY) {
    return false;
  }

  if (key.ctrl === true || key.meta === true) {
    return true;
  }

  return key.super === true && (platform ?? process.platform) === 'darwin';
}
