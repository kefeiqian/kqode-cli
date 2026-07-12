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
const FENCED_CODE_RE = /(?<=^|\n)[ \t]{0,3}(?=(`{3,}|~{3,}))\1[^\n]*\n[\s\S]*?\n[ \t]{0,3}\1[^\S\n]*(?=\n|$)/g;

// Bare URLs (linear). Inline code spans are masked by the linear scan below.
const URL_RE = /https?:\/\/\S+/g;

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
  const withoutFences = text.replace(FENCED_CODE_RE, mask);
  return maskInlineCode(withoutFences, mask).replace(URL_RE, mask);
}

/**
 * Masks inline code spans in a single linear pass. A run of N backticks is
 * closed by the next run of exactly N backticks on the same line (CommonMark).
 * A manual scan is used instead of a lazy-inner + backreference regex, which
 * backtracks quadratically on long unmatched backtick runs and would freeze the
 * render path on adversarial input.
 */
function maskInlineCode(text: string, mask: (match: string) => string): string {
  let out = '';
  let index = 0;
  while (index < text.length) {
    if (text[index] !== '`') {
      out += text[index];
      index += 1;
      continue;
    }
    let openLength = 0;
    while (text[index + openLength] === '`') openLength += 1;
    const closeIndex = findClosingRun(text, index + openLength, openLength);
    if (closeIndex === -1) {
      out += text.slice(index, index + openLength);
      index += openLength;
    } else {
      out += mask(text.slice(index, closeIndex + openLength));
      index = closeIndex + openLength;
    }
  }
  return out;
}

/** Index of the next run of exactly `length` backticks before a newline, else -1. */
function findClosingRun(text: string, from: number, length: number): number {
  let index = from;
  while (index < text.length && text[index] !== '\n') {
    if (text[index] === '`') {
      let runLength = 0;
      while (text[index + runLength] === '`') runLength += 1;
      if (runLength === length) return index;
      index += runLength;
    } else {
      index += 1;
    }
  }
  return -1;
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
