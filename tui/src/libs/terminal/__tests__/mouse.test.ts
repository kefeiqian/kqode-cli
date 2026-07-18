import { describe, expect, it } from 'vitest';
import {
  isMouseInput,
  parseMouseClickEvent,
  parseMouseInputEvents,
  parseMouseWheelEvent,
  parseMouseWheelEvents
} from '@libs/terminal/mouse.ts';

describe('parseMouseWheelEvent', () => {
  it('parses wheel-up with its 1-based pointer row', () => {
    expect(parseMouseWheelEvent('\u001B[<64;1;1M')).toEqual({ direction: 'up', row: 1 });
  });

  it('parses wheel-down with the row from the third SGR field', () => {
    expect(parseMouseWheelEvent('\u001B[<65;10;7M')).toEqual({ direction: 'down', row: 7 });
  });

  it('decodes wheel buttons carrying modifier bits as plain up/down', () => {
    // 64 + 16 (Ctrl modifier bit) still resolves to wheel-up via the modulo.
    expect(parseMouseWheelEvent('\u001B[<80;3;4M')).toEqual({ direction: 'up', row: 4 });
  });

  it('ignores release events and non-wheel buttons', () => {
    expect(parseMouseWheelEvent('\u001B[<64;1;1m')).toBeNull(); // release event
    expect(parseMouseWheelEvent('\u001B[<0;1;1M')).toBeNull(); // left-button press
  });

  it('returns null for non-mouse input', () => {
    expect(parseMouseWheelEvent('hello')).toBeNull();
  });
});

describe('parseMouseWheelEvents', () => {
  it('returns every wheel notch in a batched chunk', () => {
    expect(parseMouseWheelEvents('\u001B[<64;1;1M\u001B[<65;2;7M')).toEqual([
      { direction: 'up', row: 1 },
      { direction: 'down', row: 7 }
    ]);
  });

  it('does not consume pasted text containing a wheel-like substring', () => {
    expect(parseMouseWheelEvents('prefix [<64;1;1M suffix')).toEqual([]);
    expect(isMouseInput('prefix [<64;1;1M suffix')).toBe(false);
  });

  it('recognizes a batched click press and release as mouse input', () => {
    const input = '\u001B[<0;12;5M\u001B[<0;12;5m';
    expect(isMouseInput(input)).toBe(true);
    expect(parseMouseInputEvents(input)).toEqual([{ kind: 'click', row: 5, column: 12 }]);
  });
});

describe('isMouseInput', () => {
  it('matches SGR mouse sequences and rejects plain text', () => {
    expect(isMouseInput('\u001B[<64;1;1M')).toBe(true);
    expect(isMouseInput('\u001B[<0;5;9m')).toBe(true);
    expect(isMouseInput('abc')).toBe(false);
  });
});

describe('parseMouseClickEvent', () => {
  it('parses a left-button press into its 1-based row/column', () => {
    expect(parseMouseClickEvent('\u001B[<0;12;5M')).toEqual({ row: 5, column: 12 });
  });

  it('ignores release events, wheel events, and other buttons', () => {
    expect(parseMouseClickEvent('\u001B[<0;12;5m')).toBeNull(); // release
    expect(parseMouseClickEvent('\u001B[<64;1;1M')).toBeNull(); // wheel
    expect(parseMouseClickEvent('\u001B[<2;1;1M')).toBeNull(); // right button
  });

  it('returns null for non-mouse input', () => {
    expect(parseMouseClickEvent('hello')).toBeNull();
  });
});
