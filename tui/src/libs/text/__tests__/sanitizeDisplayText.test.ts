import { describe, expect, it } from 'vitest';
import {
  DISPLAY_OUTPUT_MAX_BYTES,
  sanitizeDisplayText
} from '@libs/text/sanitizeDisplayText.ts';

describe('sanitizeDisplayText', () => {
  it('preserves plain text, Unicode, tabs, and newlines', () => {
    const text = 'café ☕\n\tindented 日本語';
    expect(sanitizeDisplayText(text)).toBe(text);
  });

  it('escapes ESC, ANSI CSI, OSC, carriage returns, and backspaces', () => {
    const sanitized = sanitizeDisplayText('evil\u001b[2J\rrow\bback\u0007bell');

    expect(sanitized).toBe('evil\\x1b[2J\\x0drow\\x08back\\x07bell');
    expect(sanitized).not.toContain('\u001b');
    expect(sanitized).not.toContain('\r');
  });

  it('escapes DEL and C1 control bytes such as the 0x9b CSI introducer', () => {
    expect(sanitizeDisplayText('\u007f\u009b')).toBe('\\x7f\\x9b');
  });

  it('caps output at the decoded UTF-8 ceiling', () => {
    const oversized = 'a'.repeat(DISPLAY_OUTPUT_MAX_BYTES + 10);
    expect(sanitizeDisplayText(oversized).length).toBe(DISPLAY_OUTPUT_MAX_BYTES);
  });
});
