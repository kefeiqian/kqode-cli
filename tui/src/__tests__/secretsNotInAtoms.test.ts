import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const STATE_UI_ROOT = join(process.cwd(), 'src', 'state', 'ui');
const FORBIDDEN = [
  /\bapiKey\b/,
  /setProviderKey/,
  /MaskedInput/
];

describe('secret-bearing provider keys stay out of ui atoms', () => {
  it('keeps state/ui modules free of key setters, masked inputs, and apiKey fields', () => {
    const offenders = walk(STATE_UI_ROOT)
      .filter((file) => !file.includes(`${join('__tests__')}`))
      .filter((file) => FORBIDDEN.some((pattern) => pattern.test(readFileSync(file, 'utf8'))));

    expect(offenders).toEqual([]);
  });
});

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      return walk(path);
    }
    return /\.(ts|tsx)$/.test(entry) ? [path] : [];
  });
}
