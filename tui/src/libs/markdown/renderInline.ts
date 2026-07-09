import { Lexer } from 'marked';
import type { Token } from 'marked';
import type { StyledSegment } from '@libs/markdown/types.ts';

type InlineStyle = Pick<
  StyledSegment,
  'backgroundColorToken' | 'bold' | 'colorToken' | 'dimColor' | 'italic' | 'underline'
>;

/** Renders markdown inline tokens into token-colored styled segments. */
export function renderInline(markdown: string): StyledSegment[] {
  return renderInlineTokens(Lexer.lexInline(markdown, { gfm: true }), { colorToken: 'foreground' });
}

export function renderInlineTokens(tokens: readonly Token[], style: InlineStyle = {}): StyledSegment[] {
  const segments: StyledSegment[] = [];
  for (const token of tokens) {
    switch (token.type) {
      case 'strong':
        segments.push(...renderInlineTokens(token.tokens ?? [], { ...style, bold: true }));
        break;
      case 'em':
        segments.push(...renderInlineTokens(token.tokens ?? [], { ...style, italic: true }));
        break;
      case 'codespan':
        segments.push({
          ...style,
          backgroundColorToken: 'messageBackground',
          colorToken: 'accentGreen',
          text: token.text
        });
        break;
      case 'br':
        segments.push({ ...style, text: '\n' });
        break;
      case 'link':
        segments.push(
          ...renderInlineTokens(token.tokens ?? [], {
            ...style,
            colorToken: 'accentBlue',
            underline: true
          })
        );
        break;
      case 'image':
        segments.push({ ...style, colorToken: 'muted', text: token.text });
        break;
      case 'text':
        if (token.tokens !== undefined) {
          segments.push(...renderInlineTokens(token.tokens, style));
        } else {
          segments.push({ ...style, text: token.text });
        }
        break;
      case 'escape':
        segments.push({ ...style, text: token.text });
        break;
      default:
        segments.push({ ...style, text: 'text' in token ? String(token.text) : token.raw });
    }
  }
  return mergeAdjacentSegments(segments);
}

function mergeAdjacentSegments(segments: StyledSegment[]): StyledSegment[] {
  const merged: StyledSegment[] = [];
  for (const segment of segments) {
    const previous = merged[merged.length - 1];
    if (previous !== undefined && sameStyle(previous, segment)) {
      previous.text += segment.text;
    } else {
      merged.push({ ...segment });
    }
  }
  return merged;
}

function sameStyle(a: StyledSegment, b: StyledSegment): boolean {
  return (
    a.backgroundColorToken === b.backgroundColorToken &&
    a.bold === b.bold &&
    a.colorToken === b.colorToken &&
    a.dimColor === b.dimColor &&
    a.italic === b.italic &&
    a.underline === b.underline
  );
}
