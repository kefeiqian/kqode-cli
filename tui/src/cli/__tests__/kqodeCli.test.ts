import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { VERSION_ENV_VAR } from '@constants/env.ts';
import { RESUME_ARG_NAME } from '@constants/cli.ts';
import { createKqodeCommand } from '@/cli/kqodeCli.tsx';
import {
  isRustEntrypointArgs,
  runPackagedRustEntrypoint
} from '@/cli/rustEntrypoint.ts';

afterEach(() => {
  delete process.env[VERSION_ENV_VAR];
  process.exitCode = undefined;
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

describe('isRustEntrypointArgs', () => {
  it('recognizes Rust-owned packaged entrypoints before citty parses TUI flags', () => {
    expect(isRustEntrypointArgs(['--prompt', 'hello', '--json'])).toBe(true);
    expect(isRustEntrypointArgs(['--resume', 'session-id'])).toBe(false);
    expect(isRustEntrypointArgs([])).toBe(false);
  });

  it('materializes and spawns the embedded backend for packaged Rust entrypoints', async () => {
    process.env[VERSION_ENV_VAR] = '9.9.9-test';
    const asset = {
      sha256: 'a'.repeat(64),
      readBytes: () => Promise.resolve(Buffer.from('unused'))
    };
    const spawned: Array<{ binaryPath: string; args: readonly string[] }> = [];

    const handled = await runPackagedRustEntrypoint(
      { entryUrl: import.meta.url, loadPackagedAsset: () => asset },
      ['--prompt', 'hello', '--json'],
      {
        materialize: async ({ asset: received, version }) => {
          expect(received).toBe(asset);
          expect(version).toBe('9.9.9-test');
          return '/cache/kqode-backend';
        },
        spawnProcess: (binaryPath, args) => {
          spawned.push({ binaryPath, args });
          return childThatClosesWith(78);
        }
      }
    );

    expect(handled).toBe(true);
    expect(spawned).toEqual([
      { binaryPath: '/cache/kqode-backend', args: ['--prompt', 'hello', '--json'] }
    ]);
    expect(process.exitCode).toBe(78);
  });
});

function childThatClosesWith(code: number): ChildProcess {
  const child = new EventEmitter();
  queueMicrotask(() => child.emit('close', code, null));
  return child as ChildProcess;
}
