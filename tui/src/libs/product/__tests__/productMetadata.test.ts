import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { VERSION_ENV_VAR } from '@constants/env.ts';
import { readProductVersion, resolveProductVersion } from '@libs/product/productMetadata.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');

afterEach(() => {
  delete process.env[VERSION_ENV_VAR];
});

describe('resolveProductVersion', () => {
  it('prefers the injected build-time version', () => {
    process.env[VERSION_ENV_VAR] = '9.9.9-test';
    expect(resolveProductVersion({ repoRoot })).toBe('9.9.9-test');
  });

  it('falls back to the Cargo manifest version in source mode', () => {
    expect(resolveProductVersion({ repoRoot })).toBe(readProductVersion(repoRoot));
  });

  it('ignores an empty injected version', () => {
    process.env[VERSION_ENV_VAR] = '';
    expect(resolveProductVersion({ repoRoot })).toBe(readProductVersion(repoRoot));
  });

  it('throws when neither an injected version nor a repo root is available', () => {
    expect(() => resolveProductVersion({})).toThrow();
  });
});
