import { describe, expect, it } from 'vitest';
import { lookupCommand, toSubscript, toSuperscript } from '@libs/markdown/latexSymbols.ts';
import { measureGraphemes } from '@libs/text/displayWidth.ts';

describe('latexSymbols', () => {
  it('looks up Greek letters and named commands', () => {
    expect(lookupCommand('alpha')).toBe('α');
    expect(lookupCommand('Omega')).toBe('Ω');
    expect(lookupCommand('nabla')).toBe('∇');
    expect(lookupCommand('leq')).toBe('≤');
    expect(lookupCommand('sum')).toBe('∑');
    expect(lookupCommand('top')).toBe('⊤');
  });

  it('returns undefined for unknown commands (word-boundary safe)', () => {
    expect(lookupCommand('alphabet')).toBeUndefined();
    expect(lookupCommand('notacommand')).toBeUndefined();
  });

  it('renders superscripts with precomposed glyphs, including transpose', () => {
    expect(toSuperscript('2')).toBe('²');
    expect(toSuperscript('n')).toBe('ⁿ');
    expect(toSuperscript('10')).toBe('¹⁰');
    expect(toSuperscript('\\top')).toBe('ᵀ');
  });

  it('renders subscripts with precomposed glyphs', () => {
    expect(toSubscript('i')).toBe('ᵢ');
    expect(toSubscript('0')).toBe('₀');
    expect(toSubscript('ij')).toBe('ᵢⱼ');
  });

  it('falls back to caret/underscore notation when no precomposed form exists', () => {
    expect(toSuperscript('q')).toBe('^q');
    expect(toSuperscript('ab+')).toBe('ᵃᵇ⁺');
    expect(toSubscript('bc')).toBe('_(bc)');
  });

  it('emits only width-safe single-grapheme glyphs', () => {
    const samples = [
      lookupCommand('nabla'),
      lookupCommand('sum'),
      lookupCommand('int'),
      lookupCommand('leq'),
      lookupCommand('top'),
      toSuperscript('2'),
      toSuperscript('\\top'),
      toSubscript('i')
    ];
    for (const glyph of samples) {
      expect(glyph).toBeDefined();
      expect([...(glyph as string)].length).toBe(1);
      const measured = measureGraphemes(glyph as string);
      expect(measured.length).toBe(1);
      expect(measured[0]?.width).toBeGreaterThanOrEqual(1);
    }
  });
});
