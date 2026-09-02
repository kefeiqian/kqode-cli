import { common, createLowlight } from 'lowlight';
import { tokenForHighlightClasses } from '@libs/markdown/highlightTheme.ts';
import type { StyledSegment } from '@libs/markdown/types.ts';

export const MAX_HIGHLIGHT_CODE_UNITS = 8_000;

type HastNode = {
  children?: HastNode[];
  properties?: { className?: string[] };
  type: string;
  value?: string;
};

export type HighlightedCode = {
  highlighted: boolean;
  lines: StyledSegment[][];
};

const lowlight = createLowlight(common);

lowlight.registerAlias({
  bash: ['sh', 'shell'],
  javascript: ['js', 'jsx'],
  markdown: ['md'],
  typescript: ['ts', 'tsx']
});

const MAX_CACHE_ENTRIES = 256;
const cache = new Map<string, HighlightedCode>();

function cacheSet(key: string, value: HighlightedCode): void {
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, value);
}

/** Highlights a code block with a curated lowlight language set. */
export function highlightCode(code: string, language?: string): HighlightedCode {
  const normalizedLanguage = language?.trim().toLowerCase();
  const cacheKey = `${normalizedLanguage ?? ''}\0${code}`;
  const cached = cache.get(cacheKey);
  if (cached !== undefined) return cached;

  const result =
    normalizedLanguage !== undefined &&
    code.length <= MAX_HIGHLIGHT_CODE_UNITS &&
    lowlight.registered(normalizedLanguage)
      ? highlightedResult(code, normalizedLanguage)
      : plainResult(code);
  cacheSet(cacheKey, result);
  return result;
}

export function clearHighlightCodeCache(): void {
  cache.clear();
}

export function highlightCodeCacheSize(): number {
  return cache.size;
}

function highlightedResult(code: string, language: string): HighlightedCode {
  const tree = lowlight.highlight(language, code, { prefix: 'hljs-' }) as HastNode;
  return { highlighted: true, lines: splitSegmentsByLine(flattenNode(tree)) };
}

function plainResult(code: string): HighlightedCode {
  return {
    highlighted: false,
    lines: splitPreservingFinalLine(code).map((line) => [{ colorToken: 'foreground', text: line }])
  };
}

function flattenNode(node: HastNode, inheritedClasses: readonly string[] = []): StyledSegment[] {
  if (node.type === 'text') {
    return [{ colorToken: tokenForHighlightClasses(inheritedClasses), text: node.value ?? '' }];
  }
  const classes = node.properties?.className ?? inheritedClasses;
  return (node.children ?? []).flatMap((child) => flattenNode(child, classes));
}

function splitSegmentsByLine(segments: readonly StyledSegment[]): StyledSegment[][] {
  const lines: StyledSegment[][] = [[]];
  for (const segment of segments) {
    const parts = splitPreservingFinalLine(segment.text);
    parts.forEach((part, index) => {
      if (index > 0) lines.push([]);
      lines[lines.length - 1]?.push({ ...segment, text: part });
    });
  }
  return lines;
}

function splitPreservingFinalLine(text: string): string[] {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  return lines.length === 0 ? [''] : lines;
}
