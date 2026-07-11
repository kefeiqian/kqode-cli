import { describe, expect, it } from 'vitest';
import {
  isMouseInput,
  parseMouseClickEvent,
  parseMouseButtonEvent,
  parseMouseRightClickEvent,
  parseMouseWheelEvent,
  parseMouseWheelEvents,
  parseMouseWheelInput
} from '@libs/terminal/mouse.ts';

describe('parseMouseWheelEvent', () => {
  it('parses wheel-up with its 1-based pointer position', () => {
    expect(parseMouseWheelEvent('\u001B[<64;1;1M')).toEqual({ direction: 'up', row: 1, column: 1 });
  });

  describe('parseMouseRightClickEvent', () => {
    it('parses a right-button press into its 1-based row/column', () => {
      expect(parseMouseRightClickEvent('\u001B[<2;5;3M')).toEqual({ row: 3, column: 5 });
    });

    it('ignores wheel, left-button, and release events', () => {
      expect(parseMouseRightClickEvent('\u001B[<64;1;1M')).toBeNull();
      expect(parseMouseRightClickEvent('\u001B[<0;5;3M')).toBeNull();
      expect(parseMouseRightClickEvent('\u001B[<2;5;3m')).toBeNull();
    });
  });

  it('parses wheel-down with the row from the third SGR field', () => {
    expect(parseMouseWheelEvent('\u001B[<65;10;7M')).toEqual({ direction: 'down', row: 7, column: 10 });
  });

  it('decodes wheel buttons carrying modifier bits as plain up/down', () => {
    // 64 + 16 (Ctrl modifier bit) still resolves to wheel-up via the modulo.
    expect(parseMouseWheelEvent('\u001B[<80;3;4M')).toEqual({ direction: 'up', row: 4, column: 3 });
  });

  it('ignores release events and non-wheel buttons', () => {
    expect(parseMouseWheelEvent('\u001B[<64;1;1m')).toBeNull(); // release event
    expect(parseMouseWheelEvent('\u001B[<0;1;1M')).toBeNull(); // left-button press
  });

  it('returns null for non-mouse input', () => {
    expect(parseMouseWheelEvent('hello')).toBeNull();
  });
});

describe('parseMouseWheelInput (delegates to parseMouseWheelEvent)', () => {
  it('returns the direction only', () => {
    expect(parseMouseWheelInput('\u001B[<64;1;1M')).toBe('up');
    expect(parseMouseWheelInput('\u001B[<65;1;1M')).toBe('down');
    expect(parseMouseWheelInput('hello')).toBeNull();
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

describe('parseMouseButtonEvent', () => {
  it('parses left press, drag, and release with 1-based position', () => {
    expect(parseMouseButtonEvent('\u001B[<0;12;5M')).toEqual({ kind: 'press', row: 5, column: 12 });
    expect(parseMouseButtonEvent('\u001B[<32;14;5M')).toEqual({ kind: 'drag', row: 5, column: 14 });
    expect(parseMouseButtonEvent('\u001B[<0;20;7m')).toEqual({ kind: 'release', row: 7, column: 20 });
  });

  it('classifies a modifier-held left drag as a drag', () => {
    // 48 = left(0) | ctrl(16) | motion(32)
    expect(parseMouseButtonEvent('\u001B[<48;3;9M')).toEqual({ kind: 'drag', row: 9, column: 3 });
  });

  it('ignores wheel, non-left buttons, and non-mouse input', () => {
    expect(parseMouseButtonEvent('\u001B[<64;1;1M')).toBeNull(); // wheel
    expect(parseMouseButtonEvent('\u001B[<2;5;3M')).toBeNull(); // right button
    expect(parseMouseButtonEvent('\u001B[<33;5;3M')).toBeNull(); // middle-button drag
    expect(parseMouseButtonEvent('hello')).toBeNull();
  });
});

describe('parseMouseWheelEvents (batched chunk scan)', () => {
  it('captures every notch when a fast spin concatenates sequences', () => {
    const one = '\u001B[<64;10;5M';
    expect(parseMouseWheelEvents(one + one + one)).toEqual([
      { direction: 'up', row: 5, column: 10 },
      { direction: 'up', row: 5, column: 10 },
      { direction: 'up', row: 5, column: 10 }
    ]);
  });

  it('preserves notch order and per-notch direction in a mixed batch', () => {
    const up = '\u001B[<64;1;1M';
    const down = '\u001B[<65;1;1M';
    expect(parseMouseWheelEvents(up + up + down).map((event) => event.direction)).toEqual([
      'up',
      'up',
      'down'
    ]);
  });

  it('returns a one-element array equal to the singular parser for one notch', () => {
    const single = '\u001B[<64;10;5M';
    expect(parseMouseWheelEvents(single)).toEqual([parseMouseWheelEvent(single)]);
  });

  it('returns an empty array for empty and non-mouse input', () => {
    expect(parseMouseWheelEvents('')).toEqual([]);
    expect(parseMouseWheelEvents('hello')).toEqual([]);
  });

  it('skips non-wheel reports mixed into the chunk', () => {
    const wheel = '\u001B[<64;3;4M';
    const leftPress = '\u001B[<0;3;4M';
    const release = '\u001B[<0;3;4m';
    expect(parseMouseWheelEvents(leftPress + wheel + release)).toEqual([
      { direction: 'up', row: 4, column: 3 }
    ]);
  });

  it('decodes modifier-carrying wheel buttons inside a batch', () => {
    // 80 = 64 + 16 (Ctrl modifier bit); modulo keeps it wheel-up.
    const modifierUp = '\u001B[<80;3;4M';
    const plainDown = '\u001B[<65;3;4M';
    expect(parseMouseWheelEvents(modifierUp + plainDown)).toEqual([
      { direction: 'up', row: 4, column: 3 },
      { direction: 'down', row: 4, column: 3 }
    ]);
  });
});
