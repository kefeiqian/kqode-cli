import { describe, expect, it, vi } from 'vitest';
import {
  RESET_BACKGROUND_SEQUENCE,
  buildSetBackgroundSequence,
  resetTerminalBackground,
  setTerminalBackground
} from '@libs/terminal/terminalBackground.ts';

describe('terminalBackground', () => {
  it('wraps the color in an OSC 11 set-background sequence', () => {
    expect(buildSetBackgroundSequence('#282A36')).toBe('\u001B]11;#282A36\u0007');
  });

  it('exposes the OSC 111 reset-background sequence', () => {
    expect(RESET_BACKGROUND_SEQUENCE).toBe('\u001B]111\u0007');
  });

  it('writes the set-background sequence to TTY streams', () => {
    const write = vi.fn();
    const stream = { isTTY: true, write } as unknown as NodeJS.WriteStream;

    setTerminalBackground('#282A36', stream);

    expect(write).toHaveBeenCalledWith('\u001B]11;#282A36\u0007');
  });

  it('writes the reset-background sequence to TTY streams', () => {
    const write = vi.fn();
    const stream = { isTTY: true, write } as unknown as NodeJS.WriteStream;

    resetTerminalBackground(stream);

    expect(write).toHaveBeenCalledWith('\u001B]111\u0007');
  });

  it('skips non-TTY streams so captured output stays clean', () => {
    const write = vi.fn();
    const stream = { isTTY: false, write } as unknown as NodeJS.WriteStream;

    setTerminalBackground('#282A36', stream);
    resetTerminalBackground(stream);

    expect(write).not.toHaveBeenCalled();
  });
});
