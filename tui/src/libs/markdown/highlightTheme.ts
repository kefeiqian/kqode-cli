import type { ThemeColorToken } from '@libs/markdown/types.ts';

const CLASS_TOKEN_MAP: Record<string, ThemeColorToken> = {
  'hljs-attr': 'accentBlue',
  'hljs-built_in': 'accentBlue',
  'hljs-comment': 'muted',
  'hljs-keyword': 'warning',
  'hljs-literal': 'warning',
  'hljs-number': 'warning',
  'hljs-params': 'foreground',
  'hljs-string': 'accentGreen',
  'hljs-title': 'accentBlue',
  'hljs-type': 'accentBlue',
  'hljs-variable': 'foreground'
};

/** Maps highlight.js classes to KQode's existing theme color tokens. */
export function tokenForHighlightClasses(classes: readonly string[] | undefined): ThemeColorToken {
  for (const className of classes ?? []) {
    const token = CLASS_TOKEN_MAP[className];
    if (token !== undefined) {
      return token;
    }
  }
  return 'foreground';
}
