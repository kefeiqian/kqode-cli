import { describe, expect, it } from 'vitest';
import {
  RESET_SEQUENCE,
  colorize,
  foregroundSequence,
  visibleLength
} from '@libs/terminal/ansiColor.ts';

describe('ansiColor', () => {
  it('builds a truecolor foreground sequence from a 6-digit hex', () => {
    expect(foregroundSequence('#50FA7B')).toBe('\u001B[38;2;80;250;123m');
  });

  it('accepts hex without a leading # and expands 3-digit shorthand', () => {
    expect(foregroundSequence('FF5555')).toBe('\u001B[38;2;255;85;85m');
    expect(foregroundSequence('#fff')).toBe('\u001B[38;2;255;255;255m');
  });

  it('wraps text with the foreground sequence and a trailing reset', () => {
    expect(colorize('+3', '#50FA7B')).toBe(`\u001B[38;2;80;250;123m+3${RESET_SEQUENCE}`);
  });

  it('measures visible length ignoring SGR color escapes', () => {
    expect(visibleLength(colorize('+12', '#50FA7B'))).toBe(3);
    expect(visibleLength('plain')).toBe(5);
  });
});
