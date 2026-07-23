import { describe, expect, it } from 'vitest';
import { isMouseInput, parseMouseInputEvents } from '@libs/terminal/mouse.ts';

describe('parseMouseInputEvents', () => {
  it('parses wheel-up with its 1-based pointer row', () => {
    expect(parseMouseInputEvents('\u001B[<64;1;1M')).toEqual([
      { kind: 'wheel', direction: 'up', row: 1 }
    ]);
  });

  it('parses wheel-down with the row from the third SGR field', () => {
    expect(parseMouseInputEvents('\u001B[<65;10;7M')).toEqual([
      { kind: 'wheel', direction: 'down', row: 7 }
    ]);
  });

  it('decodes wheel buttons carrying modifier bits as plain up/down', () => {
    // 64 + 16 (Ctrl modifier bit) still resolves to wheel-up via the modulo.
    expect(parseMouseInputEvents('\u001B[<80;3;4M')).toEqual([
      { kind: 'wheel', direction: 'up', row: 4 }
    ]);
  });

  it('returns every wheel notch in a batched chunk', () => {
    expect(parseMouseInputEvents('\u001B[<64;1;1M\u001B[<65;2;7M')).toEqual([
      { kind: 'wheel', direction: 'up', row: 1 },
      { kind: 'wheel', direction: 'down', row: 7 }
    ]);
  });

  it('does not consume pasted text containing a wheel-like substring', () => {
    expect(parseMouseInputEvents('prefix [<64;1;1M suffix')).toBeNull();
    expect(isMouseInput('prefix [<64;1;1M suffix')).toBe(false);
  });

  it('recognizes a batched click press and release as mouse input', () => {
    const input = '\u001B[<0;12;5M\u001B[<0;12;5m';
    expect(isMouseInput(input)).toBe(true);
    expect(parseMouseInputEvents(input)).toEqual([{ kind: 'click', row: 5, column: 12 }]);
  });

  it('parses a left-button press into its 1-based row/column', () => {
    expect(parseMouseInputEvents('\u001B[<0;12;5M')).toEqual([
      { kind: 'click', row: 5, column: 12 }
    ]);
  });

  it('recognizes but omits releases and unsupported buttons', () => {
    expect(parseMouseInputEvents('\u001B[<0;12;5m')).toEqual([]);
    expect(parseMouseInputEvents('\u001B[<2;1;1M')).toEqual([]);
  });

  it('returns null for non-mouse input', () => {
    expect(parseMouseInputEvents('hello')).toBeNull();
  });
});

describe('isMouseInput', () => {
  it('matches SGR mouse sequences and rejects plain text', () => {
    expect(isMouseInput('\u001B[<64;1;1M')).toBe(true);
    expect(isMouseInput('\u001B[<0;5;9m')).toBe(true);
    expect(isMouseInput('abc')).toBe(false);
  });
});
