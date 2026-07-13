/**
 * Kitty keyboard protocol "report all keys" enhancement. This makes compatible
 * terminals report modified text keys such as macOS Command+C as CSI-u key
 * events that Ink can parse into `key.super`.
 */
export const ENABLE_KITTY_KEYBOARD_PROTOCOL_SEQUENCE = '\u001B[>8u';

/** Pops the keyboard enhancement flags pushed by the enable sequence. */
export const DISABLE_KITTY_KEYBOARD_PROTOCOL_SEQUENCE = '\u001B[<u';

/** Enables enhanced keyboard reporting on TTY streams that support it. */
export function enableTerminalKeyboardProtocol(
  stream: NodeJS.WriteStream = process.stdout
): void {
  if (!stream.isTTY) {
    return;
  }

  stream.write(ENABLE_KITTY_KEYBOARD_PROTOCOL_SEQUENCE);
}

/** Restores the previous keyboard reporting mode on TTY streams. */
export function disableTerminalKeyboardProtocol(
  stream: NodeJS.WriteStream = process.stdout
): void {
  if (!stream.isTTY) {
    return;
  }

  stream.write(DISABLE_KITTY_KEYBOARD_PROTOCOL_SEQUENCE);
}
