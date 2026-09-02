import { describe, expect, it } from 'vitest';
import { isAllowedLinkHref, linkSegment, sanitizeLinkHref } from '@libs/markdown/linkSegment.ts';
import { renderInline } from '@libs/markdown/renderInline.ts';

describe('linkSegment', () => {
  it('renders links as styled visible label plus URL fallback by default', () => {
    expect(linkSegment('docs', 'https://example.test')).toEqual({
      colorToken: 'accentBlue',
      text: 'docs (https://example.test)',
      underline: true
    });
  });

  it('does not duplicate autolink labels', () => {
    expect(linkSegment('https://example.test', 'https://example.test').text).toBe(
      'https://example.test'
    );
  });

  it('allowlists only http, https, and mailto schemes for future OSC 8 use', () => {
    expect(isAllowedLinkHref('https://example.test')).toBe(true);
    expect(isAllowedLinkHref('http://example.test')).toBe(true);
    expect(isAllowedLinkHref('mailto:dev@example.test')).toBe(true);
    expect(isAllowedLinkHref('javascript:alert(1)')).toBe(false);
    expect(isAllowedLinkHref('file:///etc/passwd')).toBe(false);
  });

  it('strips decoded control bytes from hrefs', () => {
    expect(sanitizeLinkHref('https://x.test/\u001b]8;;bad\u0007')).toBe('https://x.test/]8;;bad');
  });

  it('renders markdown links and bare autolinks safely', () => {
    expect(renderInline('[docs](https://example.test)')[0]).toMatchObject({
      text: 'docs (https://example.test)',
      underline: true
    });
    expect(renderInline('<https://example.test>')[0]?.text).toBe('https://example.test');
    expect(renderInline('[x](javascript:alert(1))')[0]?.text).toBe('x (javascript:alert(1))');
  });
});
