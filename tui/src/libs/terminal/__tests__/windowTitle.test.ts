import { describe, expect, it, vi } from 'vitest';
import {
  buildWindowTitleSequence,
  formatWindowTitle,
  resetTerminalWindowTitle,
  setTerminalWindowTitle
} from '@libs/terminal/windowTitle.ts';

describe('windowTitle', () => {
  it('wraps the title in an OSC 2 set-window-title sequence', () => {
    expect(buildWindowTitleSequence('KQode v0.1.0')).toBe('\u001B]2;KQode v0.1.0\u0007');
  });

  it('formats the product name and version like "KQode v0.1.0"', () => {
    expect(formatWindowTitle('KQode', '0.1.0')).toBe('KQode v0.1.0');
  });

  it('writes the escape sequence to TTY streams', () => {
    const write = vi.fn();
    const stream = { isTTY: true, write } as unknown as NodeJS.WriteStream;

    setTerminalWindowTitle('KQode', '0.1.0', stream);

    expect(write).toHaveBeenCalledWith('\u001B]2;KQode v0.1.0\u0007');
  });

  it('skips non-TTY streams so captured output stays clean', () => {
    const write = vi.fn();
    const stream = { isTTY: false, write } as unknown as NodeJS.WriteStream;

    setTerminalWindowTitle('KQode', '0.1.0', stream);

    expect(write).not.toHaveBeenCalled();
  });

  it('resets the title with an empty OSC 2 sequence on TTY streams', () => {
    const write = vi.fn();
    const stream = { isTTY: true, write } as unknown as NodeJS.WriteStream;

    resetTerminalWindowTitle(stream);

    expect(write).toHaveBeenCalledWith('\u001B]2;\u0007');
  });

  it('skips the reset on non-TTY streams so captured output stays clean', () => {
    const write = vi.fn();
    const stream = { isTTY: false, write } as unknown as NodeJS.WriteStream;

    resetTerminalWindowTitle(stream);

    expect(write).not.toHaveBeenCalled();
  });
});
