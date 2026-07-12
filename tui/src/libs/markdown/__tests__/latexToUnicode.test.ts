import { describe, expect, it } from 'vitest';
import { convertLatexToUnicode } from '@libs/markdown/latexToUnicode.ts';

describe('convertLatexToUnicode', () => {
  it('converts inline math with a LaTeX marker (AE6)', () => {
    expect(convertLatexToUnicode('see $\\alpha$ here')).toBe('see α here');
  });

  it('converts the transpose-gradient example (AE1)', () => {
    expect(convertLatexToUnicode('$\\nabla_x (x^\\top A x) = (A + A^\\top)x$')).toBe(
      '∇ₓ (xᵀ A x) = (A + Aᵀ)x'
    );
  });

  it('unwraps boxed display math (AE2)', () => {
    expect(
      convertLatexToUnicode('\\[ \\boxed{\\nabla_x (x^\\top A x) = 2Ax} \\]').trim()
    ).toBe('∇ₓ (xᵀ A x) = 2Ax');
  });

  it('leaves currency untouched (AE3, AE5)', () => {
    expect(convertLatexToUnicode('It costs $5.99 total')).toBe('It costs $5.99 total');
    expect(convertLatexToUnicode('prices range $5 to $10')).toBe('prices range $5 to $10');
  });

  it('leaves shell variables untouched (AE4)', () => {
    expect(convertLatexToUnicode('echo $USER $HOME')).toBe('echo $USER $HOME');
  });

  it('leaves inline code spans verbatim (AE7)', () => {
    expect(convertLatexToUnicode('run `$\\to$` now')).toBe('run `$\\to$` now');
  });

  it('leaves fenced code blocks verbatim (fenced masking)', () => {
    const latex = '```latex\n$x^2$\n```';
    expect(convertLatexToUnicode(latex)).toBe(latex);
    const shell = '```sh\na=$x_1; b=$y_2\n```';
    expect(convertLatexToUnicode(shell)).toBe(shell);
  });

  it('leaves unknown commands and Windows paths untouched (AE8)', () => {
    expect(convertLatexToUnicode('the \\alphabet word')).toBe('the \\alphabet word');
    expect(convertLatexToUnicode('path C:\\Users\\name\\docs')).toBe('path C:\\Users\\name\\docs');
  });

  it('converts fractions and common symbols', () => {
    expect(convertLatexToUnicode('$\\frac{a}{b} \\leq c$')).toBe('a/b ≤ c');
    expect(convertLatexToUnicode('$\\sum_{i=1}^{n} x_i$')).toBe('∑ᵢ₌₁ⁿ xᵢ');
  });

  it('handles $$ and \\( \\) delimiters', () => {
    expect(convertLatexToUnicode('$$\\alpha + \\beta$$')).toBe('α + β');
    expect(convertLatexToUnicode('\\(\\gamma\\)')).toBe('γ');
  });

  it('is total: preserves plain text and empty input', () => {
    expect(convertLatexToUnicode('')).toBe('');
    expect(convertLatexToUnicode('no math here at all')).toBe('no math here at all');
  });

  it('handles long unmatched backtick runs quickly (no catastrophic backtracking)', () => {
    const pathological = '`'.repeat(40_000) + ' text ' + '`'.repeat(20_000);
    const start = Date.now();
    const result = convertLatexToUnicode(pathological);
    expect(Date.now() - start).toBeLessThan(500);
    expect(result).toBe(pathological);
  });
});
