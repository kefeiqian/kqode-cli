import { describe, expect, it } from 'vitest';
import { resolveComposerTextSegments } from '@components/PromptComposer/ComposerFrame.tsx';

describe('resolveComposerTextSegments', () => {
  it('keeps authored trailing spaces out of the background padding segment', () => {
    expect(resolveComposerTextSegments('a ', 4)).toEqual({ text: 'a ', padding: '  ' });
  });

  it('keeps a blank prompt space in the authored segment', () => {
    expect(resolveComposerTextSegments(' ', 4)).toEqual({ text: ' ', padding: '   ' });
  });
});
