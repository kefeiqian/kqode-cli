import { describe, expect, it } from 'vitest';
import { printableInput, validateComposerSubmit } from '@libs/composer/promptText.ts';

describe('printableInput', () => {
  it('keeps slash, mention, and help affordance characters printable', () => {
    expect(printableInput('/@?')).toBe('/@?');
  });

  it('strips control characters from pasted input while retaining printable text', () => {
    expect(printableInput('hello\nworld\t!')).toBe('helloworld!');
  });

  it('ignores terminal key escape sequences instead of inserting their printable tail', () => {
    expect(printableInput('\u001B[27;2;65~')).toBe('');
    expect(printableInput('[27;2;65~')).toBe('');
    expect(printableInput('\u001BOA')).toBe('');
  });

  it('keeps normal shifted printable characters', () => {
    expect(printableInput('A')).toBe('A');
    expect(printableInput('!')).toBe('!');
  });
});

describe('validateComposerSubmit', () => {
  it('blocks empty and all-whitespace submit values', () => {
    expect(validateComposerSubmit('')).toEqual({ ok: false, reason: 'empty', message: '' });
    expect(validateComposerSubmit('   ')).toEqual({ ok: false, reason: 'empty', message: '' });
  });

  it('preserves the exact non-empty submit snapshot', () => {
    expect(validateComposerSubmit('  hello  ')).toEqual({ ok: true, text: '  hello  ' });
  });

  it('reports over-limit prompts before backend submission', () => {
    expect(validateComposerSubmit('hello', 4)).toEqual({
      ok: false,
      reason: 'over-limit',
      message: 'Prompt is 5 bytes; maximum is 4 bytes.'
    });
  });
});
