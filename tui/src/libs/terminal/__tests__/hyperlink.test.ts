import { describe, expect, it } from 'vitest';
import { dottedUnderline, hyperlink } from '@libs/terminal/hyperlink.ts';

describe('hyperlink', () => {
  it('wraps text in an OSC 8 hyperlink pointing at the url', () => {
    expect(hyperlink('#3', 'https://github.com/o/r/pull/3')).toBe(
      '\u001B]8;;https://github.com/o/r/pull/3\u0007#3\u001B]8;;\u0007'
    );
  });
});

describe('dottedUnderline', () => {
  it('primes a standard underline before the dotted refinement so the reset survives', () => {
    // Leading `4m` (plain underline) keeps Ink's slice-ansi tracking the state so
    // the `24m` reset is preserved; `4:3m` upgrades to dotted where supported.
    expect(dottedUnderline('#3')).toBe('\u001B[4m\u001B[4:3m#3\u001B[24m');
  });
});
