import { describe, expect, it } from 'vitest';
import { sanitizeModelId } from '@libs/providers/sanitizeModelId.ts';

describe('sanitizeModelId', () => {
  it('strips C0, DEL, and C1 controls', () => {
    expect(sanitizeModelId('a\u0000b\u007fc\u009fd')).toBe('abcd');
  });

  it('strips CSI and OSC terminal escapes', () => {
    const input = 'safe\u001B[31m-red\u001B[0m\u001B]0;title\u0007-model\u001B]8;;url\u001B\\x';
    expect(sanitizeModelId(input)).toBe('safe-red-modelx');
  });
});
