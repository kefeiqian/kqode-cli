import { afterEach, describe, expect, it } from 'vitest';
import { VERSION_ENV_VAR } from '@constants/env.ts';
import { CLI_NAME } from '@constants/product.ts';
import { buildKqodeMeta } from '@/cli/meta.ts';

afterEach(() => {
  delete process.env[VERSION_ENV_VAR];
});

describe('buildKqodeMeta', () => {
  it('names the CLI and carries a non-empty description', () => {
    process.env[VERSION_ENV_VAR] = '9.9.9-test';
    const meta = buildKqodeMeta({ entryUrl: import.meta.url });
    expect(meta.name).toBe(CLI_NAME);
    expect(meta.description.length).toBeGreaterThan(0);
  });

  it('uses the injected build-time version (citty prints it for --version)', () => {
    process.env[VERSION_ENV_VAR] = '9.9.9-test';
    expect(buildKqodeMeta({ entryUrl: import.meta.url }).version).toBe('9.9.9-test');
  });
});
