import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BackendErrorKind } from '@contracts/backend/index.ts';
import { buildBackend, resolveBackendBinaryPath } from '@backend/process/backendBuild.ts';

describe('resolveBackendBinaryPath', () => {
  it('uses platform-correct debug executable naming', () => {
    expect(resolveBackendBinaryPath('/repo', 'win32')).toBe(
      path.join('/repo', 'target', 'debug', 'kqode.exe')
    );
    expect(resolveBackendBinaryPath('/repo', 'linux')).toBe(
      path.join('/repo', 'target', 'debug', 'kqode')
    );
  });
});

describe('buildBackend', () => {
  it('rejects with a launch error when the build exits non-zero', async () => {
    await expect(
      buildBackend({
        repoRoot: process.cwd(),
        command: process.execPath,
        args: ['-e', 'process.stderr.write("boom"); process.exit(2)']
      })
    ).rejects.toMatchObject({ kind: BackendErrorKind.Launch });
  });

  it('rejects with a timeout error and stops a hung build', async () => {
    await expect(
      buildBackend({
        repoRoot: process.cwd(),
        timeoutMs: 150,
        command: process.execPath,
        args: ['-e', 'setTimeout(() => {}, 5000)']
      })
    ).rejects.toMatchObject({ kind: BackendErrorKind.Timeout });
  });

  it('rejects with a launch error when the build command cannot start', async () => {
    await expect(
      buildBackend({
        repoRoot: process.cwd(),
        command: 'kqode-nonexistent-build-command-xyz',
        args: []
      })
    ).rejects.toMatchObject({ kind: BackendErrorKind.Launch });
  });
});
