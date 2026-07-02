import { describe, expect, it } from 'vitest';
import { capUtf8Bytes, utf8ByteLength } from '@libs/text/utf8.ts';

describe('utf8ByteLength', () => {
  it('counts ASCII as one byte per character', () => {
    expect(utf8ByteLength('hello')).toBe(5);
  });

  it('counts multi-byte code points by their UTF-8 size', () => {
    expect(utf8ByteLength('é')).toBe(2);
    expect(utf8ByteLength('😀')).toBe(4);
  });
});

describe('capUtf8Bytes', () => {
  it('returns the text unchanged when within the cap', () => {
    expect(capUtf8Bytes('hello', 10)).toBe('hello');
  });

  it('truncates ASCII to the byte cap', () => {
    expect(capUtf8Bytes('hello world', 5)).toBe('hello');
  });

  it('does not split a multi-byte code point at the boundary', () => {
    // 'a' (1 byte) + '😀' (4 bytes); capping the source at 3 bytes keeps 'a' and
    // replaces the partial emoji tail rather than emitting a broken sequence.
    const capped = capUtf8Bytes('a😀', 3);
    expect(capped.startsWith('a')).toBe(true);
    expect(capped.includes('😀')).toBe(false);
  });
});
