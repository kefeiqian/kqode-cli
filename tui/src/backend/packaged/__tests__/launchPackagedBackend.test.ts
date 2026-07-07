import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { BackendClientError, BackendErrorKind } from '@contracts/backend/index.ts';
import type { LaunchedBackend } from '@backend/process/backendProcess.ts';
import { launchPackagedBackend } from '@backend/packaged/launchPackagedBackend.ts';
import type { EmbeddedBackendAsset } from '@backend/packaged/materializeBackend.ts';

const asset: EmbeddedBackendAsset = {
  sha256: 'c'.repeat(64),
  readBytes: () => Promise.resolve(Buffer.from('unused in these tests'))
};

function fakeLaunched(): LaunchedBackend {
  return {
    pid: 1234,
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    stderrText: () => '',
    onExit: () => undefined,
    dispose: () => undefined
  };
}

describe('launchPackagedBackend', () => {
  it('spawns the materialized binary path in the workspace cwd', async () => {
    const materialize = vi.fn(async () => '/cache/runtime/0.1.0/kqode-backend');
    const spawn = vi.fn(async () => fakeLaunched());

    const backend = await launchPackagedBackend(
      { asset, version: '0.1.0', workspaceCwd: '/work/dir' },
      { materialize, spawn }
    );

    expect(backend.pid).toBe(1234);
    expect(materialize).toHaveBeenCalledWith(
      expect.objectContaining({ asset, version: '0.1.0' })
    );
    expect(spawn).toHaveBeenCalledWith(
      expect.objectContaining({
        binaryPath: '/cache/runtime/0.1.0/kqode-backend',
        workspaceCwd: '/work/dir'
      })
    );
  });

  it('never spawns when materialization fails', async () => {
    const materialize = vi.fn(() =>
      Promise.reject(new BackendClientError(BackendErrorKind.Launch, 'integrity failed'))
    );
    const spawn = vi.fn(async () => fakeLaunched());

    await expect(
      launchPackagedBackend(
        { asset, version: '0.1.0', workspaceCwd: '/work/dir' },
        { materialize, spawn }
      )
    ).rejects.toMatchObject({ kind: BackendErrorKind.Launch });

    expect(spawn).not.toHaveBeenCalled();
  });
});
