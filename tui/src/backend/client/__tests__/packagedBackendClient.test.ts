import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BackendErrorKind } from '@contracts/backend/index.ts';
import { BackendLifecycleState } from '@backend/client/backendClient.ts';
import { createPackagedBackendClient } from '@backend/client/packagedBackendClient.ts';
import type { EmbeddedBackendAsset } from '@backend/packaged/materializeBackend.ts';

const tempDirs: string[] = [];

function tempCacheBase(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kqode-pkg-client-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop() as string, { recursive: true, force: true });
  }
});

describe('createPackagedBackendClient', () => {
  it('fails closed with a launch error when the embedded asset cannot be read', async () => {
    const readBytes = vi.fn(() => Promise.reject(new Error('asset bytes unavailable')));
    const asset: EmbeddedBackendAsset = { sha256: 'a'.repeat(64), readBytes };
    const client = createPackagedBackendClient({
      asset,
      version: '9.9.9-test',
      workspaceCwd: process.cwd(),
      cacheBaseDir: tempCacheBase()
    });

    await expect(
      client.submit({ turnId: 'turn-1', text: 'hello' })
    ).rejects.toMatchObject({
      kind: BackendErrorKind.Launch
    });
    expect(client.getState()).toBe(BackendLifecycleState.Dead);
    // Reaching readBytes proves the real materialize pipeline runs, not a stub.
    expect(readBytes).toHaveBeenCalledTimes(1);

    client.dispose();
  });
});
