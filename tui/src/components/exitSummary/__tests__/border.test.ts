import { describe, expect, it } from 'vitest';
import { boxed } from '@components/exitSummary/border.ts';

describe('boxed', () => {
  it('wraps lines in a rounded border sized to the widest line', () => {
    const lines = boxed(['ab', 'cdef'], { padding: 1 });

    expect(lines[0]).toBe('╭──────╮');
    expect(lines).toContain('│ ab   │');
    expect(lines).toContain('│ cdef │');
    expect(lines.at(-1)).toBe('╰──────╯');
  });

  it('aligns the right border using the injected visible-width measure', () => {
    // Simulate a colored cell: 6 escape chars, 2 visible.
    const colored = '\u001B[31mAB\u001B[0m';
    const lines = boxed([colored, 'WXYZ'], {
      padding: 1,
      width: (line) => line.replace(/\u001B\[[0-9;]*m/g, '').length
    });

    const rightBorders = lines.map((line) => line.at(-1));
    expect(new Set(rightBorders)).toEqual(new Set(['╮', '│', '╯']));
    // Both body rows share the same rendered length despite the escapes.
    const bodyLengths = lines.slice(1, -1).map((line) => line.length);
    expect(bodyLengths[0]).toBe(bodyLengths[1] + colored.length - 2);
  });
});
