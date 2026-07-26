import { describe, expect, it } from 'vitest';
import { isMouseInput, parseMouseInputEvents } from '@libs/terminal/mouse.ts';
import { SgrMouseButton, sgrMouseInput } from '@test/terminalInput.ts';

describe('parseMouseInputEvents', () => {
  it('parses wheel-up with its 1-based pointer row', () => {
    expect(parseMouseInputEvents(sgrMouseInput(SgrMouseButton.WheelUp, 1, 1))).toEqual([
      { kind: 'wheel', direction: 'up', row: 1 }
    ]);
  });

  it('parses wheel-down with the row from the third SGR field', () => {
    expect(parseMouseInputEvents(sgrMouseInput(SgrMouseButton.WheelDown, 10, 7))).toEqual([
      { kind: 'wheel', direction: 'down', row: 7 }
    ]);
  });

  it('decodes wheel buttons carrying modifier bits as plain up/down', () => {
    expect(
      parseMouseInputEvents(sgrMouseInput(SgrMouseButton.WheelUpWithCtrl, 3, 4))
    ).toEqual([
      { kind: 'wheel', direction: 'up', row: 4 }
    ]);
  });

  it('returns every wheel notch in a batched chunk', () => {
    const input =
      sgrMouseInput(SgrMouseButton.WheelUp, 1, 1) +
      sgrMouseInput(SgrMouseButton.WheelDown, 2, 7);
    expect(parseMouseInputEvents(input)).toEqual([
      { kind: 'wheel', direction: 'up', row: 1 },
      { kind: 'wheel', direction: 'down', row: 7 }
    ]);
  });

  it('does not consume pasted text containing a wheel-like substring', () => {
    const wheelLikeText = sgrMouseInput(SgrMouseButton.WheelUp, 1, 1).slice(1);
    const input = `prefix ${wheelLikeText} suffix`;
    expect(parseMouseInputEvents(input)).toBeNull();
    expect(isMouseInput(input)).toBe(false);
  });

  it('recognizes a batched click press and release as mouse input', () => {
    const input =
      sgrMouseInput(SgrMouseButton.Left, 12, 5) +
      sgrMouseInput(SgrMouseButton.Left, 12, 5, 'm');
    expect(isMouseInput(input)).toBe(true);
    expect(parseMouseInputEvents(input)).toEqual([
      { kind: 'press', row: 5, column: 12 },
      { kind: 'release', row: 5, column: 12 }
    ]);
  });

  it('parses a left-button press into its 1-based row/column', () => {
    expect(parseMouseInputEvents(sgrMouseInput(SgrMouseButton.Left, 12, 5))).toEqual([
      { kind: 'press', row: 5, column: 12 }
    ]);
  });

  it('parses left drag/release and right-button presses', () => {
    expect(parseMouseInputEvents(sgrMouseInput(SgrMouseButton.LeftDrag, 12, 5))).toEqual([
      { kind: 'drag', row: 5, column: 12 }
    ]);
    expect(
      parseMouseInputEvents(sgrMouseInput(SgrMouseButton.Left, 12, 5, 'm'))
    ).toEqual([
      { kind: 'release', row: 5, column: 12 }
    ]);
    expect(parseMouseInputEvents(sgrMouseInput(SgrMouseButton.Right, 1, 1))).toEqual([
      { kind: 'rightClick', row: 1, column: 1 }
    ]);
  });

  it('ignores right-button motion and unsupported horizontal wheel input', () => {
    expect(parseMouseInputEvents(sgrMouseInput(SgrMouseButton.RightDrag, 4, 5))).toEqual([]);
    expect(parseMouseInputEvents(sgrMouseInput(SgrMouseButton.WheelLeft, 4, 5))).toEqual([]);
  });

  it('returns null for non-mouse input', () => {
    expect(parseMouseInputEvents('hello')).toBeNull();
  });
});

describe('isMouseInput', () => {
  it('matches SGR mouse sequences and rejects plain text', () => {
    expect(isMouseInput(sgrMouseInput(SgrMouseButton.WheelUp, 1, 1))).toBe(true);
    expect(isMouseInput(sgrMouseInput(SgrMouseButton.Left, 5, 9, 'm'))).toBe(true);
    expect(isMouseInput('abc')).toBe(false);
  });
});
