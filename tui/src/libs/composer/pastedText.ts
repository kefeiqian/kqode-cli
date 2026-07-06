const CARRIAGE_RETURN_PATTERN = /\r\n?/g;
const PASTE_CONTROL_CHAR_PATTERN = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g;

/**
 * Sanitizes clipboard or bracketed-paste text before inserting it into the composer.
 *
 * Newlines and tabs are preserved as author intent, while terminal control bytes
 * are stripped so pasted escape sequences cannot affect the TUI.
 */
export function sanitizePastedText(text: string): string {
  return text.replace(CARRIAGE_RETURN_PATTERN, '\n').replace(PASTE_CONTROL_CHAR_PATTERN, '');
}
