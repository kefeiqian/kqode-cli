import { afterEach, describe, expect, it } from 'vitest';
import { VERSION_ENV_VAR } from '@constants/env.ts';
import { RESUME_ARG_NAME } from '@constants/cli.ts';
import { createKqodeCommand } from '@/cli/kqodeCli.tsx';

afterEach(() => {
  delete process.env[VERSION_ENV_VAR];
});

describe('createKqodeCommand', () => {
  it('exposes a string --resume arg with a help description (covers R8, R10)', () => {
    process.env[VERSION_ENV_VAR] = '9.9.9-test';
    const command = createKqodeCommand({ entryUrl: import.meta.url });
    const args = command.args as Record<string, { type?: string; description?: string }>;

    expect(args[RESUME_ARG_NAME]).toBeDefined();
    expect(args[RESUME_ARG_NAME].type).toBe('string');
    expect(args[RESUME_ARG_NAME].description ?? '').not.toBe('');
  });
});
