import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import resolve from '../../packaging/npm/kqode/lib/resolve.cjs';
import { exeSuffix, parseArgs, resolveProductVersion } from './scriptUtils.ts';

/**
 * Packages the current host's standalone `kqode` executable into a
 * direct-download release archive plus checksums under `tui/dist/release/`.
 *
 * Produces `kqode-<target>.tar.gz` (POSIX) or `kqode-<target>.zip` (Windows)
 * containing the executable plus third-party notices, a per-archive
 * `kqode-<target>.sha256`, and an aggregate `checksums.txt`. Each CI runner runs
 * this for its own target; the release job concatenates the per-target `.sha256` files. The standalone
 * executable is NOT built here — run `cargo xtask package` first (the
 * `cargo xtask package-release` wrapper does) or pass `--exe=<path>`. Override
 * with `--version=`, `--exe=`, or `--out=`.
 */

const tuiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(tuiRoot, '..');
const RELEASE_NOTICE_FILES = ['THIRD_PARTY_NOTICES.md'] as const;

/** Maps Node's `process.platform` to the release-archive OS segment. */
const RELEASE_OS: Record<string, string> = {
  darwin: 'darwin',
  linux: 'linux',
  win32: 'windows'
};

interface HostTarget {
  /** Release target name, e.g. `kqode-windows-x64`. */
  target: string;
  /** Archive file name, e.g. `kqode-windows-x64.zip`. */
  archive: string;
  /** Archive format for the host platform. */
  ext: 'zip' | 'tar.gz';
  /** Executable name inside the archive, e.g. `kqode` or `kqode.exe`. */
  binaryName: string;
}

function resolveHostTarget(): HostTarget {
  const { platform, arch } = process;
  if (!resolve.isSupported(platform, arch)) {
    throw new Error(
      `unsupported release target ${platform}-${arch}; ` +
        `supported: ${resolve.SUPPORTED_TARGETS.join(', ')}`
    );
  }
  const target = `kqode-${RELEASE_OS[platform]}-${arch}`;
  const ext = platform === 'win32' ? 'zip' : 'tar.gz';
  return { target, archive: `${target}.${ext}`, ext, binaryName: resolve.binaryName(platform) };
}

/**
 * Archives the executable at `exePath` as `host.archive`, guaranteeing the
 * archive holds the executable and notices at its root.
 *
 * Uses `tar` (bsdtar/GNU tar), present on every supported runner: gzip for
 * POSIX targets and, on Windows, bsdtar's `-a` zip autodetection.
 */
function createArchive(host: HostTarget, exePath: string, releaseDir: string): string {
  const stageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kqode-release-'));
  try {
    const staged = path.join(stageDir, host.binaryName);
    fs.copyFileSync(exePath, staged);
    for (const notice of RELEASE_NOTICE_FILES) {
      fs.copyFileSync(path.join(repoRoot, notice), path.join(stageDir, notice));
    }
    if (process.platform !== 'win32') {
      fs.chmodSync(staged, 0o755);
    }

    const archivePath = path.join(releaseDir, host.archive);
    const archiveEntries = [host.binaryName, ...RELEASE_NOTICE_FILES];
    const tarArgs =
      host.ext === 'zip'
        ? ['-a', '-cf', archivePath, '-C', stageDir, ...archiveEntries]
        : ['-czf', archivePath, '-C', stageDir, ...archiveEntries];

    const result = spawnSync('tar', tarArgs, { stdio: ['ignore', 'inherit', 'inherit'] });
    if (result.error) {
      throw new Error(`failed to run tar for ${host.archive}: ${result.error.message}`);
    }
    if (result.status !== 0) {
      throw new Error(`tar exited with ${result.status} creating ${host.archive}`);
    }
    return archivePath;
  } finally {
    fs.rmSync(stageDir, { recursive: true, force: true });
  }
}

function sha256File(filePath: string): string {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const version = args.get('version') ?? resolveProductVersion({ repoRoot });
  const host = resolveHostTarget();
  const exePath = args.get('exe') ?? path.join(tuiRoot, 'dist', `kqode${exeSuffix}`);
  const releaseDir = args.get('out') ?? path.join(tuiRoot, 'dist', 'release');

  if (!fs.existsSync(exePath)) {
    throw new Error(
      `standalone executable not found at ${exePath}; ` +
        'run `cargo xtask package` first or pass --exe=<path>'
    );
  }

  fs.rmSync(releaseDir, { recursive: true, force: true });
  fs.mkdirSync(releaseDir, { recursive: true });

  const archivePath = createArchive(host, exePath, releaseDir);
  const digest = sha256File(archivePath);
  const checksumLine = `${digest}  ${host.archive}\n`;
  fs.writeFileSync(path.join(releaseDir, `${host.target}.sha256`), checksumLine);
  fs.writeFileSync(path.join(releaseDir, 'checksums.txt'), checksumLine);

  console.log(`Release artifacts for ${host.target} (version ${version}):`);
  console.log(`  archive:   ${archivePath}`);
  console.log(`  sha256:    ${digest}`);
  console.log(`  checksums: ${path.join(releaseDir, 'checksums.txt')}`);
}

main();
