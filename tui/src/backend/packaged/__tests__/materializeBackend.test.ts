import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BackendClientError, BackendErrorKind } from '@contracts/backend/index.ts';
import {
  materializePackagedBackend,
  type EmbeddedBackendAsset
} from '@backend/packaged/materializeBackend.ts';
import {
  packagedBackendBinaryName,
  resolvePackagedBackendPaths
} from '@backend/packaged/backendCacheDir.ts';

const PLATFORM: NodeJS.Platform = process.platform;
const isWindows = PLATFORM === 'win32';
const tempDirs: string[] = [];

function tempBase(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kqode-materialize-'));
  tempDirs.push(dir);
  return dir;
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function asset(bytes: Buffer, sha = sha256(bytes)): EmbeddedBackendAsset & { calls: () => number } {
  let calls = 0;
  return {
    sha256: sha,
    readBytes: () => {
      calls += 1;
      return Promise.resolve(bytes);
    },
    calls: () => calls
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop() as string, { recursive: true, force: true });
  }
});

describe('materializePackagedBackend', () => {
  it('writes the embedded binary into the content-addressed per-user cache', async () => {
    const cacheBaseDir = tempBase();
    const bytes = Buffer.from('fake backend v1');
    const binaryPath = await materializePackagedBackend({
      asset: asset(bytes),
      version: '0.1.0',
      cacheBaseDir
    });

    const expected = resolvePackagedBackendPaths({
      version: '0.1.0',
      sha256: sha256(bytes),
      cacheBaseDir
    }).binaryPath;
    expect(binaryPath).toBe(expected);
    expect(fs.readFileSync(binaryPath)).toEqual(bytes);
    expect(path.basename(binaryPath)).toBe(packagedBackendBinaryName());
  });

  it('isolates different versions in separate directories', async () => {
    const cacheBaseDir = tempBase();
    const a = await materializePackagedBackend({ asset: asset(Buffer.from('v1')), version: '1.0.0', cacheBaseDir });
    const b = await materializePackagedBackend({ asset: asset(Buffer.from('v2')), version: '2.0.0', cacheBaseDir });
    expect(path.dirname(a)).not.toBe(path.dirname(b));
  });

  it('isolates different backend contents at the same version by hash', async () => {
    const cacheBaseDir = tempBase();
    const oldBytes = Buffer.from('backend build A');
    const newBytes = Buffer.from('backend build B');
    const a = await materializePackagedBackend({ asset: asset(oldBytes), version: '0.1.0', cacheBaseDir });
    const b = await materializePackagedBackend({ asset: asset(newBytes), version: '0.1.0', cacheBaseDir });

    // Same version, different content -> distinct content-addressed dirs that
    // coexist, so a rebuilt backend never overwrites a still-present old one.
    expect(path.dirname(a)).not.toBe(path.dirname(b));
    expect(fs.readFileSync(a)).toEqual(oldBytes);
    expect(fs.readFileSync(b)).toEqual(newBytes);
  });

  it('reuses an already-materialized binary without re-reading the asset', async () => {
    const cacheBaseDir = tempBase();
    const reusable = asset(Buffer.from('cached backend'));
    await materializePackagedBackend({ asset: reusable, version: '0.1.0', cacheBaseDir });
    await materializePackagedBackend({ asset: reusable, version: '0.1.0', cacheBaseDir });
    expect(reusable.calls()).toBe(1);
  });

  it('re-materializes when the cached binary content no longer matches its digest', async () => {
    const cacheBaseDir = tempBase();
    const good = asset(Buffer.from('good backend'));
    const binaryPath = await materializePackagedBackend({ asset: good, version: '0.1.0', cacheBaseDir });

    fs.writeFileSync(binaryPath, Buffer.from('tampered'));
    await materializePackagedBackend({ asset: good, version: '0.1.0', cacheBaseDir });

    expect(fs.readFileSync(binaryPath)).toEqual(Buffer.from('good backend'));
    expect(good.calls()).toBe(2);
  });

  it('rejects an asset whose bytes do not match its declared digest', async () => {
    const cacheBaseDir = tempBase();
    const corrupt: EmbeddedBackendAsset = {
      sha256: 'f'.repeat(64),
      readBytes: () => Promise.resolve(Buffer.from('mismatched bytes'))
    };

    await expect(
      materializePackagedBackend({ asset: corrupt, version: '0.1.0', cacheBaseDir })
    ).rejects.toMatchObject({ kind: BackendErrorKind.Launch });

    const binaryPath = resolvePackagedBackendPaths({
      version: '0.1.0',
      sha256: 'f'.repeat(64),
      cacheBaseDir
    }).binaryPath;
    expect(fs.existsSync(binaryPath)).toBe(false);
  });

  it.skipIf(isWindows)('creates the binary and runtime dir with user-only permissions', async () => {
    const cacheBaseDir = tempBase();
    const binaryPath = await materializePackagedBackend({
      asset: asset(Buffer.from('perm check')),
      version: '0.1.0',
      cacheBaseDir
    });
    expect(fs.statSync(binaryPath).mode & 0o777).toBe(0o700);
    expect(fs.statSync(path.dirname(binaryPath)).mode & 0o777).toBe(0o700);
  });

  it.skipIf(isWindows)('refuses to follow a symlink planted at the cache path', async () => {
    const cacheBaseDir = tempBase();
    const { runtimeDir, binaryPath } = resolvePackagedBackendPaths({
      version: '0.1.0',
      sha256: sha256(Buffer.from('real')),
      cacheBaseDir
    });
    fs.mkdirSync(runtimeDir, { recursive: true });
    const decoy = path.join(cacheBaseDir, 'decoy-target');
    fs.writeFileSync(decoy, Buffer.from('attacker controlled'));
    fs.symlinkSync(decoy, binaryPath);

    await expect(
      materializePackagedBackend({ asset: asset(Buffer.from('real')), version: '0.1.0', cacheBaseDir })
    ).rejects.toBeInstanceOf(BackendClientError);
    // The symlinked decoy was never written through.
    expect(fs.readFileSync(decoy)).toEqual(Buffer.from('attacker controlled'));
  });

  it.skipIf(isWindows)('re-materializes a cached binary that has loose (group/other) permissions', async () => {
    const cacheBaseDir = tempBase();
    const embedded = asset(Buffer.from('perm-fix backend'));
    const binaryPath = await materializePackagedBackend({
      asset: embedded,
      version: '0.1.0',
      cacheBaseDir
    });
    expect(embedded.calls()).toBe(1);

    // Loosen the cached binary to group/other read+execute: a permissive mode is
    // treated as stale, so the embedded bytes are re-read and rewritten tight.
    fs.chmodSync(binaryPath, 0o755);

    const rewritten = await materializePackagedBackend({
      asset: embedded,
      version: '0.1.0',
      cacheBaseDir
    });

    expect(rewritten).toBe(binaryPath);
    expect(embedded.calls()).toBe(2);
    expect(fs.statSync(binaryPath).mode & 0o777).toBe(0o700);
  });

  it('rejects when a non-regular file (directory) occupies the cache path', async () => {
    const cacheBaseDir = tempBase();
    const { runtimeDir, binaryPath } = resolvePackagedBackendPaths({
      version: '0.1.0',
      sha256: sha256(Buffer.from('real')),
      cacheBaseDir
    });
    fs.mkdirSync(runtimeDir, { recursive: true });
    // Plant a directory where the binary is expected: inspectExisting must refuse
    // it as a non-regular file rather than trust, follow, or overwrite it.
    fs.mkdirSync(binaryPath);

    await expect(
      materializePackagedBackend({ asset: asset(Buffer.from('real')), version: '0.1.0', cacheBaseDir })
    ).rejects.toMatchObject({ kind: BackendErrorKind.Launch });
  });

  it('leaves no temp staging files behind after a successful materialization', async () => {
    const cacheBaseDir = tempBase();
    const { runtimeDir } = resolvePackagedBackendPaths({
      version: '0.1.0',
      sha256: sha256(Buffer.from('clean')),
      cacheBaseDir
    });
    await materializePackagedBackend({ asset: asset(Buffer.from('clean')), version: '0.1.0', cacheBaseDir });
    const leftovers = fs.readdirSync(runtimeDir).filter((name) => name.endsWith('.tmp'));
    expect(leftovers).toEqual([]);
  });

  it('reuses a binary a concurrent instance materialized when its own write loses the race', async () => {
    const cacheBaseDir = tempBase();
    const bytes = Buffer.from('raced backend');
    // Simulate the winner writing the valid binary, then our own write failing
    // (e.g. the winner already spawned and locked it on Windows).
    const losingWrite = (binaryPath: string, runtimeDir: string): void => {
      fs.mkdirSync(runtimeDir, { recursive: true });
      fs.writeFileSync(binaryPath, bytes);
      throw new Error('EBUSY: binary is locked by the winning instance');
    };

    const result = await materializePackagedBackend(
      { asset: asset(bytes), version: '0.1.0', cacheBaseDir },
      { writeBinary: losingWrite }
    );

    const expected = resolvePackagedBackendPaths({
      version: '0.1.0',
      sha256: sha256(bytes),
      cacheBaseDir
    }).binaryPath;
    expect(result).toBe(expected);
    expect(fs.readFileSync(result)).toEqual(bytes);
  });

  it('propagates a write failure when no valid binary ends up present', async () => {
    const cacheBaseDir = tempBase();
    const failingWrite = (): void => {
      throw new Error('ENOSPC: no space left on device');
    };

    await expect(
      materializePackagedBackend(
        { asset: asset(Buffer.from('unwritable')), version: '0.1.0', cacheBaseDir },
        { writeBinary: failingWrite }
      )
    ).rejects.toThrow('ENOSPC');
  });

  it('reuses the cache when the post-write read hits a concurrent replace gap', async () => {
    const cacheBaseDir = tempBase();
    const bytes = Buffer.from('gap backend');
    // The injected write leaves a genuinely valid binary (as a concurrent winner
    // would)...
    const write = (binaryPath: string, runtimeDir: string): void => {
      fs.mkdirSync(runtimeDir, { recursive: true });
      fs.writeFileSync(binaryPath, bytes);
    };
    // ...but the immediate post-write read-back observes the atomic-replace gap
    // once (ENOENT), which must fall back to reusing the valid cache.
    vi.spyOn(fs, 'readFileSync').mockImplementationOnce(() => {
      const error: NodeJS.ErrnoException = new Error('ENOENT: file briefly absent');
      error.code = 'ENOENT';
      throw error;
    });

    const result = await materializePackagedBackend(
      { asset: asset(bytes), version: '0.1.0', cacheBaseDir },
      { writeBinary: write }
    );

    const expected = resolvePackagedBackendPaths({
      version: '0.1.0',
      sha256: sha256(bytes),
      cacheBaseDir
    }).binaryPath;
    expect(result).toBe(expected);
  });

  it('fails closed when the post-write binary is corrupt and no valid cache exists', async () => {
    const cacheBaseDir = tempBase();
    const corruptWrite = (binaryPath: string, runtimeDir: string): void => {
      fs.mkdirSync(runtimeDir, { recursive: true });
      fs.writeFileSync(binaryPath, Buffer.from('corrupted on write'));
    };

    await expect(
      materializePackagedBackend(
        { asset: asset(Buffer.from('intended backend')), version: '0.1.0', cacheBaseDir },
        { writeBinary: corruptWrite }
      )
    ).rejects.toThrow('post-write integrity check');
  });
});
