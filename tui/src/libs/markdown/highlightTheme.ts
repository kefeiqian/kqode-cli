import type { ThemeColorToken } from '@libs/markdown/types.ts';

const CLASS_TOKEN_MAP: Record<string, ThemeColorToken> = {
  'hljs-addition': 'accentGreen',
  'hljs-attr': 'accentBlue',
  'hljs-attribute': 'accentBlue',
  'hljs-built_in': 'accentBlue',
  'hljs-bullet': 'warning',
  'hljs-comment': 'muted',
  'hljs-deletion': 'errorRed',
  'hljs-doctag': 'warning',
  'hljs-keyword': 'warning',
  'hljs-literal': 'warning',
  'hljs-meta': 'muted',
  'hljs-name': 'accentBlue',
  'hljs-number': 'warning',
  'hljs-operator': 'foreground',
  'hljs-params': 'foreground',
  'hljs-property': 'foreground',
  'hljs-punctuation': 'muted',
  'hljs-quote': 'muted',
  'hljs-regexp': 'accentGreen',
  'hljs-section': 'accentBlue',
  'hljs-selector-attr': 'accentGreen',
  'hljs-selector-class': 'accentGreen',
  'hljs-selector-id': 'accentGreen',
  'hljs-selector-pseudo': 'accentGreen',
  'hljs-selector-tag': 'warning',
  'hljs-string': 'accentGreen',
  'hljs-subst': 'foreground',
  'hljs-symbol': 'accentBlue',
  'hljs-template-tag': 'muted',
  'hljs-template-variable': 'foreground',
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
