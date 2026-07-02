import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { BackendClientError, BackendErrorKind } from '@contracts/backend/index.ts';

const USER_ONLY_DIR_MODE = 0o700;
const GROUP_OTHER_MASK = 0o077;

/** Wraps a materialization failure as a fail-closed `launch`-kind backend error. */
export function materializationError(message: string, cause?: unknown): BackendClientError {
  return new BackendClientError(
    BackendErrorKind.Launch,
    `packaged backend materialization failed: ${message}`,
    cause === undefined ? undefined : { cause }
  );
}

export function sha256Hex(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function isErrnoCode(error: unknown, code: string): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === code;
}

export type ExistingState = 'missing' | 'reusable' | 'stale';

/**
 * Classifies any binary already present at the cache path without trusting it.
 *
 * A symlink or non-regular file is rejected outright (never followed); loose
 * group/other permissions on Unix are treated as stale so the file is rewritten
 * with tight permissions; otherwise the on-disk SHA-256 decides reuse.
 */
export function inspectExisting(
  binaryPath: string,
  expectedSha: string,
  platform: NodeJS.Platform
): ExistingState {
  let stats: fs.Stats;
  try {
    stats = fs.lstatSync(binaryPath);
  } catch (error) {
    if (isErrnoCode(error, 'ENOENT')) {
      return 'missing';
    }
    throw materializationError(`could not inspect ${binaryPath}`, error);
  }

  if (stats.isSymbolicLink()) {
    throw materializationError(`refusing to follow a symlink at ${binaryPath}`);
  }
  if (!stats.isFile()) {
    throw materializationError(`cache path is not a regular file: ${binaryPath}`);
  }
  if (platform !== 'win32' && (stats.mode & GROUP_OTHER_MASK) !== 0) {
    return 'stale';
  }
  return sha256Hex(fs.readFileSync(binaryPath)) === expectedSha ? 'reusable' : 'stale';
}

export function ensureRuntimeDir(runtimeDir: string, platform: NodeJS.Platform): void {
  fs.mkdirSync(runtimeDir, { recursive: true, mode: USER_ONLY_DIR_MODE });
  if (platform !== 'win32') {
    // mkdir's mode is masked by umask, so tighten explicitly.
    fs.chmodSync(runtimeDir, USER_ONLY_DIR_MODE);
  }
}

/** Replaces `binaryPath` with `tmpPath`, guarding against a swapped-in symlink. */
function replaceAtomically(tmpPath: string, binaryPath: string, platform: NodeJS.Platform): void {
  try {
    const targetStats = fs.lstatSync(binaryPath);
    if (targetStats.isSymbolicLink()) {
      throw materializationError(`refusing to replace a symlink at ${binaryPath}`);
    }
    if (platform === 'win32') {
      // Windows rename cannot overwrite an existing file.
      fs.rmSync(binaryPath, { force: true });
    }
  } catch (error) {
    if (error instanceof BackendClientError) {
      throw error;
    }
    if (!isErrnoCode(error, 'ENOENT')) {
      throw materializationError(`could not prepare ${binaryPath} for replacement`, error);
    }
  }
  fs.renameSync(tmpPath, binaryPath);
}

/** Writes `bytes` to a fresh sibling temp file, then atomically moves it into place. */
export function writeBinary(
  binaryPath: string,
  runtimeDir: string,
  bytes: Buffer,
  platform: NodeJS.Platform
): void {
  const tmpPath = path.join(
    runtimeDir,
    `${path.basename(binaryPath)}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`
  );

  let fd: number | undefined;
  try {
    // 'wx' creates a new file and fails if one exists, so a planted temp path is never reused.
    fd = fs.openSync(tmpPath, 'wx', USER_ONLY_DIR_MODE);
    fs.writeSync(fd, bytes);
    fs.fsyncSync(fd);
  } catch (error) {
    if (fd !== undefined) {
      fs.closeSync(fd);
    }
    fs.rmSync(tmpPath, { force: true });
    throw materializationError(`could not stage backend binary at ${tmpPath}`, error);
  }
  fs.closeSync(fd);

  try {
    if (platform !== 'win32') {
      fs.chmodSync(tmpPath, USER_ONLY_DIR_MODE);
    }
    replaceAtomically(tmpPath, binaryPath, platform);
  } catch (error) {
    fs.rmSync(tmpPath, { force: true });
    throw error;
  }
}
