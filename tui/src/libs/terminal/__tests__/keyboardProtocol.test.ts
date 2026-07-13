import { describe, expect, it, vi } from 'vitest';
import {
  DISABLE_KITTY_KEYBOARD_PROTOCOL_SEQUENCE,
  ENABLE_KITTY_KEYBOARD_PROTOCOL_SEQUENCE,
  disableTerminalKeyboardProtocol,
  enableTerminalKeyboardProtocol
} from '@libs/terminal/keyboardProtocol.ts';

describe('keyboardProtocol', () => {
  it('exposes the kitty keyboard protocol push/pop sequences', () => {
    expect(ENABLE_KITTY_KEYBOARD_PROTOCOL_SEQUENCE).toBe('\u001B[>8u');
    expect(DISABLE_KITTY_KEYBOARD_PROTOCOL_SEQUENCE).toBe('\u001B[<u');
  });

  it('writes the enable sequence to TTY streams', () => {
    const write = vi.fn();
    const stream = { isTTY: true, write } as unknown as NodeJS.WriteStream;

    enableTerminalKeyboardProtocol(stream);

    expect(write).toHaveBeenCalledWith(ENABLE_KITTY_KEYBOARD_PROTOCOL_SEQUENCE);
  });

  it('writes the disable sequence to TTY streams', () => {
    const write = vi.fn();
    const stream = { isTTY: true, write } as unknown as NodeJS.WriteStream;

    disableTerminalKeyboardProtocol(stream);

    expect(write).toHaveBeenCalledWith(DISABLE_KITTY_KEYBOARD_PROTOCOL_SEQUENCE);
  });

  it('skips non-TTY streams so captured output stays clean', () => {
    const write = vi.fn();
    const stream = { isTTY: false, write } as unknown as NodeJS.WriteStream;

    enableTerminalKeyboardProtocol(stream);
    disableTerminalKeyboardProtocol(stream);

    expect(write).not.toHaveBeenCalled();
  });
});
