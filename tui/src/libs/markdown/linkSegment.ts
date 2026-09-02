import type { StyledSegment } from '@libs/markdown/types.ts';

const HREF_CONTROL_PATTERN = /[\u0000-\u001f\u007f-\u009f]/g;
const ALLOWED_SCHEMES = new Set(['http:', 'https:', 'mailto:']);

/** Builds the safe visible markdown-link segment used by the transcript. */
export function linkSegment(label: string, href: string): StyledSegment {
  const sanitizedHref = sanitizeLinkHref(href);
  const displayText = label === sanitizedHref ? label : `${label} (${sanitizedHref})`;
  return {
    colorToken: 'accentBlue',
    text: displayText,
    underline: true
  };
}

export function sanitizeLinkHref(href: string): string {
  return href.replace(HREF_CONTROL_PATTERN, '');
}

export function isAllowedLinkHref(href: string): boolean {
  try {
    return ALLOWED_SCHEMES.has(new URL(sanitizeLinkHref(href)).protocol);
  } catch {
    return false;
  }
}
