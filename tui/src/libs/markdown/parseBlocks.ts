import { Lexer } from 'marked';
import type { Token } from 'marked';

/** Parses markdown into marked block tokens with GFM features enabled. */
export function parseBlocks(markdown: string): Token[] {
  return Lexer.lex(markdown, { gfm: true });
}

export function tokenPlainText(token: Token): string {
  if ('raw' in token && typeof token.raw === 'string') {
    return token.raw.replace(/\n$/, '');
  }
  if ('text' in token && typeof token.text === 'string') {
    return token.text;
  }
  return '';
}
