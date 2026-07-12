import { lookupCommand, toSubscript, toSuperscript } from '@libs/markdown/latexSymbols.ts';

/**
 * Converts LaTeX math in already-sanitized assistant markdown into readable
 * terminal Unicode. It is deliberately conservative and lossy-but-safe:
 * anything it does not recognize (unknown `\command`, currency, shell vars,
 * Windows paths) is left exactly as-is.
 *
 * Run this BEFORE markdown tokenization. Inline-code spans, fenced code
 * blocks, and URLs are masked so their contents pass through verbatim, and the
 * output is Unicode text only (never ANSI, which the display sanitizer would
 * neutralize).
 */

/** Upper bound on input length; beyond this the text is returned unchanged (R6). */
const MAX_LATEX_INPUT = 100_000;

const MASK_SENTINEL = '\uE000';
const MASK_PATTERN = /\uE000(\d+)\uE000/g;

// Fenced code blocks (``` / ~~~, closed within the completed slice). Bounded:
// lazy body with an anchored, same-run closing fence.
const FENCED_CODE_RE = /(?<=^|\n)[ \t]{0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?\n[ \t]{0,3}\1[^\S\n]*(?=\n|$)/g;

// Inline code spans (matched backtick runs) and bare URLs.
const INLINE_SPAN_RE = /(`+)([^`\n]+?)\1|https?:\/\/\S+/g;

/** Public entry: total (never throws) and bounded. */
export function convertLatexToUnicode(text: string): string {
  if (text.length === 0 || text.length > MAX_LATEX_INPUT) return text;
  try {
    const preserved: string[] = [];
    const masked = maskSpans(text, preserved);
    const converted = stripMathDelimiters(masked);
    return restoreSpans(converted, preserved);
  } catch {
    return text;
  }
}

function maskSpans(text: string, preserved: string[]): string {
  const mask = (match: string): string => {
    const index = preserved.push(match) - 1;
    return `${MASK_SENTINEL}${index}${MASK_SENTINEL}`;
  };
  return text.replace(FENCED_CODE_RE, mask).replace(INLINE_SPAN_RE, mask);
}

function restoreSpans(text: string, preserved: string[]): string {
  return text.replace(MASK_PATTERN, (match, index: string) => preserved[Number(index)] ?? match);
}

/**
 * Converts math spans. Display delimiters (`$$…$$`, `\[…\]`, `\(…\)`) always
 * convert; bare `$…$` converts only when the inner text carries a LaTeX marker
 * (`\command`, `_`, `^`) or is a single variable, so currency and shell
 * variables stay literal. Escaped `\$` is never treated as a delimiter.
 */
function stripMathDelimiters(text: string): string {
  let out = text.replace(/(?<!\\)\$\$([^$]+?)\$\$/g, (_, inner: string) => applyMathMode(inner));
  out = out.replace(/\\\[([\s\S]+?)\\\]/g, (_, inner: string) => applyMathMode(inner));
  out = out.replace(/\\\(([\s\S]+?)\\\)/g, (_, inner: string) => applyMathMode(inner));
  out = out.replace(/(?<!\\)\$([^$\n]+?)(?<!\\)\$/g, (match: string, inner: string) => {
    const hasMarker = /\\[A-Za-z]|[\\_^]/.test(inner);
    const singleVar = /^\s*[A-Za-z]\s*$/.test(inner);
    return hasMarker || singleVar ? applyMathMode(inner) : match;
  });
  return out;
}

/**
 * Applies math-mode conversions to the inner text of a math span: structural
 * unwrapping first, then sub/superscripts, then named symbols. All brace
 * regexes are single-level (`[^{}]`) to stay bounded.
 */
function applyMathMode(inner: string): string {
  let out = inner;

  out = out.replace(
    /\\begin\{(aligned|align\*?|gathered|split)\}([\s\S]*?)\\end\{\1\}/g,
    (_, _env: string, body: string) => body.replace(/&/g, '').replace(/\\\\/g, '\n')
  );

  out = out.replace(/\\(?:textbf|mathbf)\{([^{}]*)\}/g, (_, x: string) => `**${x}**`);
  out = out.replace(/\\(?:textit|emph|mathit)\{([^{}]*)\}/g, (_, x: string) => `*${x}*`);
  out = out.replace(
    /\\(?:text|mathrm|mathsf|mathtt|mathbb|mathcal|mathfrak|operatorname|boxed)\{([^{}]*)\}/g,
    (_, x: string) => x
  );

  out = out.replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, (_, a: string, b: string) => `${a}/${b}`);
  out = out.replace(/\\sqrt\s*\{([^{}]*)\}/g, (_, x: string) => `√${x}`);

  out = out.replace(/\\(?:left|right|big|Big|bigg|Bigg)\b\s*/g, '');
  out = out.replace(/\\[,;:!]/g, ' ').replace(/\\ /g, ' ');

  out = out.replace(/\^\{([^{}]*)\}/g, (_, x: string) => toSuperscript(x));
  out = out.replace(/\^(\\[A-Za-z]+|[^\s{}\\])/g, (_, x: string) => toSuperscript(x));
  out = out.replace(/_\{([^{}]*)\}/g, (_, x: string) => toSubscript(x));
  out = out.replace(/_(\\[A-Za-z]+|[^\s{}\\])/g, (_, x: string) => toSubscript(x));

  out = out.replace(/\\([A-Za-z]+)/g, (match: string, name: string) => lookupCommand(name) ?? match);

  return out.replace(/[ \t]{2,}/g, ' ').trim();
}
