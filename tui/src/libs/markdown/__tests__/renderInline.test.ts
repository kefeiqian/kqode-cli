import { describe, expect, it } from 'vitest';
import { renderInline } from '@libs/markdown/renderInline.ts';

describe('renderInline', () => {
  it('renders strong, emphasis, combined emphasis, and inline code without markers', () => {
    const segments = renderInline('**bold** *italic* ***both*** `code`');

    expect(segments).toEqual([
      { bold: true, colorToken: 'foreground', text: 'bold' },
      { colorToken: 'foreground', text: ' ' },
      { colorToken: 'foreground', italic: true, text: 'italic' },
      { colorToken: 'foreground', text: ' ' },
      { bold: true, colorToken: 'foreground', italic: true, text: 'both' },
      { colorToken: 'foreground', text: ' ' },
      { backgroundColorToken: 'messageBackground', colorToken: 'accentGreen', text: 'code' }
    ]);
  });
});
