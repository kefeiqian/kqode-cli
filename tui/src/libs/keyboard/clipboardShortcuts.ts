import { PASTE_INPUT_KEY } from '@constants/ui.ts';

type SelectionCopyKey = {
  upArrow?: boolean;
  downArrow?: boolean;
  leftArrow?: boolean;
  rightArrow?: boolean;
  pageDown?: boolean;
  pageUp?: boolean;
  home?: boolean;
  end?: boolean;
  return?: boolean;
  escape?: boolean;
  shift?: boolean;
  tab?: boolean;
  backspace?: boolean;
  delete?: boolean;
  ctrl?: boolean;
  meta?: boolean;
  super?: boolean;
  hyper?: boolean;
  capsLock?: boolean;
  numLock?: boolean;
  eventType?: 'press' | 'repeat' | 'release';
};

const COPY_INPUT = 'c';

/** Returns whether the key event is the universal `Ctrl+C` shortcut. */
export function isCtrlCShortcut(input: string, key: SelectionCopyKey): boolean {
  return input === COPY_INPUT && key.ctrl === true;
}

/**
 * Returns whether an enhanced keyboard event represents modifier-key state only.
 * These events should not dismiss selections or disarm pending confirmations.
 */
export function isModifierOnlyKeyEvent(input: string, key: SelectionCopyKey): boolean {
  if (input !== '' || key.eventType === undefined) {
    return false;
  }

  if (
    key.upArrow === true ||
    key.downArrow === true ||
    key.leftArrow === true ||
    key.rightArrow === true ||
    key.pageDown === true ||
    key.pageUp === true ||
    key.home === true ||
    key.end === true ||
    key.return === true ||
    key.escape === true ||
    key.tab === true ||
    key.backspace === true ||
    key.delete === true
  ) {
    return false;
  }

  return (
    key.shift === true ||
    key.ctrl === true ||
    key.meta === true ||
    key.super === true ||
    key.hyper === true ||
    key.capsLock === true ||
    key.numLock === true ||
    key.eventType === 'release'
  );
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

  if (input !== COPY_INPUT || key.super !== true) {
    return false;
  }

  return (platform ?? process.platform) === 'darwin';
}

/**
 * Returns whether a key event should paste from the system clipboard.
 * `Ctrl+V` is universal; macOS also accepts forwarded Command forms.
 */
export function isClipboardPasteShortcut(
  input: string,
  key: SelectionCopyKey,
  platform?: NodeJS.Platform
): boolean {
  if (input !== PASTE_INPUT_KEY) {
    return false;
  }

  if (key.ctrl === true) {
    return true;
  }

  return key.super === true && (platform ?? process.platform) === 'darwin';
}
