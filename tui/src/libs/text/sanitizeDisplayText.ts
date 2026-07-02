import { capUtf8Bytes } from '@libs/text/utf8.ts';

/** Decoded UTF-8 ceiling for backend/error output rendered in the body. */
export const DISPLAY_OUTPUT_MAX_BYTES = 128 * 1024;

// C0/C1 control bytes excluding tab (\u0009) and newline (\u000a), which the
// body renderer handles as legitimate layout characters.
const CONTROL_CHAR_PATTERN = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g;

/**
 * Neutralizes terminal-control characters in text bound for Ink `Text`.
 *
 * Backend ACK payloads, error messages, and user prompts can carry ESC/ANSI
 * CSI/OSC sequences, carriage returns, or other control bytes. Those are
 * rewritten to visible `\xNN` escapes so persisted-but-untrusted text cannot
 * clear the screen, move the cursor, or restyle the UI. Output is first capped
 * at `maxBytes` decoded UTF-8 so a huge payload cannot flood the transcript.
 */
export function sanitizeDisplayText(text: string, maxBytes = DISPLAY_OUTPUT_MAX_BYTES): string {
  return capUtf8Bytes(text, maxBytes).replace(CONTROL_CHAR_PATTERN, escapeControlChar);
}

function escapeControlChar(char: string): string {
  const codePoint = char.codePointAt(0) ?? 0;
  return `\\x${codePoint.toString(16).padStart(2, '0')}`;
}
