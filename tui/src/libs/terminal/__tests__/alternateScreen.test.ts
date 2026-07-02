import { describe, expect, it, vi } from 'vitest';
import {
  ENTER_ALTERNATE_SCREEN_SEQUENCE,
  LEAVE_ALTERNATE_SCREEN_SEQUENCE,
  enterAlternateScreen,
  leaveAlternateScreen
} from '@libs/terminal/alternateScreen.ts';

describe('alternateScreen', () => {
  it('exposes the DEC mode 1049 enter/leave sequences', () => {
    expect(ENTER_ALTERNATE_SCREEN_SEQUENCE).toBe('\u001B[?1049h');
    expect(LEAVE_ALTERNATE_SCREEN_SEQUENCE).toBe('\u001B[?1049l');
  });

  it('writes the enter sequence to TTY streams', () => {
    const write = vi.fn();
    const stream = { isTTY: true, write } as unknown as NodeJS.WriteStream;

    enterAlternateScreen(stream);

    expect(write).toHaveBeenCalledWith('\u001B[?1049h');
  });

  it('writes the leave sequence to TTY streams', () => {
    const write = vi.fn();
    const stream = { isTTY: true, write } as unknown as NodeJS.WriteStream;

    leaveAlternateScreen(stream);

    expect(write).toHaveBeenCalledWith('\u001B[?1049l');
  });

  it('skips non-TTY streams so captured output stays clean', () => {
    const write = vi.fn();
    const stream = { isTTY: false, write } as unknown as NodeJS.WriteStream;

    enterAlternateScreen(stream);
    leaveAlternateScreen(stream);

    expect(write).not.toHaveBeenCalled();
  });
});
