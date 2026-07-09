import { Lexer } from 'marked';
import type { Token } from 'marked';

/** Parses markdown into marked block tokens with GFM features enabled. */
export function parseBlocks(markdown: string): Token[] {
  return Lexer.lex(markdown, { gfm: true });
}

export type StreamingMarkdownParts = {
  completed: string;
  trailing: string;
};

/** Splits streaming markdown so only closed blocks are formatted. */
export function splitStreamingMarkdown(markdown: string): StreamingMarkdownParts {
  const normalized = markdown.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const boundary = lastCompletedBoundary(normalized);
  return {
    completed: normalized.slice(0, boundary),
    trailing: normalized.slice(boundary)
  };
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

function lastCompletedBoundary(markdown: string): number {
  if (markdown.length === 0) return 0;

  let inFence = false;
  let lastBoundary = 0;
  let offset = 0;
  const lines = markdown.split(/(\n)/);
  for (let index = 0; index < lines.length; index += 2) {
    const line = lines[index] ?? '';
    const newline = lines[index + 1] ?? '';
    const fullLine = line + newline;
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      if (!inFence) lastBoundary = offset + fullLine.length;
    } else if (!inFence && line.trim().length === 0 && newline.length > 0) {
      lastBoundary = offset + fullLine.length;
    }
    offset += fullLine.length;
  }

  return !inFence && markdown.endsWith('\n') ? markdown.length : lastBoundary;
}
