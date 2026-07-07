import { describe, expect, it, vi } from 'vitest';
import { HIDE_CURSOR_SEQUENCE, hideTerminalCursor } from '@libs/terminal/cursorVisibility.ts';

describe('cursorVisibility', () => {
  it('exposes the DECTCEM hide-cursor sequence', () => {
    expect(HIDE_CURSOR_SEQUENCE).toBe('\u001B[?25l');
  });

  it('writes the hide-cursor sequence to TTY streams', () => {
    const write = vi.fn();
    const stream = { isTTY: true, write } as unknown as NodeJS.WriteStream;

    hideTerminalCursor(stream);

    expect(write).toHaveBeenCalledWith('\u001B[?25l');
  });

  it('skips non-TTY streams so captured output stays clean', () => {
    const write = vi.fn();
    const stream = { isTTY: false, write } as unknown as NodeJS.WriteStream;

    hideTerminalCursor(stream);

    expect(write).not.toHaveBeenCalled();
  });
});
