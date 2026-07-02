const textEncoder = new TextEncoder();
const utf8Decoder = new TextDecoder('utf-8');

/** UTF-8 byte length of `text`. */
export function utf8ByteLength(text: string): number {
  return textEncoder.encode(text).length;
}

/**
 * Truncates `text` to at most `maxBytes` UTF-8 *source* bytes.
 *
 * Decoding the truncated byte view replaces any partial trailing code point with
 * U+FFFD, so the result never ends mid-sequence. The decoded string may be a few
 * bytes longer than `maxBytes` when the tail is replaced (U+FFFD is 3 bytes).
 */
export function capUtf8Bytes(text: string, maxBytes: number): string {
  const bytes = textEncoder.encode(text);
  if (bytes.length <= maxBytes) {
    return text;
  }
  return utf8Decoder.decode(bytes.subarray(0, maxBytes));
}
