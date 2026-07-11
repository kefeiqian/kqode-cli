import { describe, expect, it, vi } from 'vitest';
import {
  buildWindowTitleSequence,
  formatSessionWindowTitle,
  formatWindowTitle,
  resetTerminalWindowTitle,
  setSessionWindowTitle,
  setTerminalWindowTitle
} from '@libs/terminal/windowTitle.ts';

describe('windowTitle', () => {
  it('wraps the title in an OSC 2 set-window-title sequence', () => {
    expect(buildWindowTitleSequence('KQode v0.1.0')).toBe('\u001B]2;KQode v0.1.0\u0007');
  });

  it('formats the product name and version like "KQode v0.1.0"', () => {
    expect(formatWindowTitle('KQode', '0.1.0')).toBe('KQode v0.1.0');
  });

  it('formats a resumed session title as just the summary, without a product prefix', () => {
    expect(formatSessionWindowTitle('KQode', 'Fix the parser bug')).toBe('Fix the parser bug');
  });

  it('trims surrounding whitespace from the session summary', () => {
    expect(formatSessionWindowTitle('KQode', '  Refactor VFS  ')).toBe('Refactor VFS');
  });

  it('falls back to just the product name for an empty session summary', () => {
    expect(formatSessionWindowTitle('KQode', '   ')).toBe('KQode');
  });

  it('clips an over-long session summary with an ellipsis', () => {
    const summary = 'a'.repeat(100);
    const title = formatSessionWindowTitle('KQode', summary);

    expect(title).toBe(`${'a'.repeat(71)}…`);
  });

  it('writes the session title escape sequence to TTY streams', () => {
    const write = vi.fn();
    const stream = { isTTY: true, write } as unknown as NodeJS.WriteStream;

    setSessionWindowTitle('KQode', 'Fix the parser bug', stream);

    expect(write).toHaveBeenCalledWith('\u001B]2;Fix the parser bug\u0007');
  });

  it('skips the session title on non-TTY streams so captured output stays clean', () => {
    const write = vi.fn();
    const stream = { isTTY: false, write } as unknown as NodeJS.WriteStream;

    setSessionWindowTitle('KQode', 'Fix the parser bug', stream);

    expect(write).not.toHaveBeenCalled();
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
