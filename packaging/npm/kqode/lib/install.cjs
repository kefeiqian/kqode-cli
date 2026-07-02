'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const {
  isSupported,
  binaryName,
  releaseTargetName,
  archiveExt,
  releaseBaseUrl,
  REPO
} = require('./resolve.cjs');

/**
 * Downloads and installs the platform-specific `kqode` executable from the
 * matching GitHub Release, verifying its SHA-256 before use.
 *
 * The single npm package (`@kqode/kqode-cli`) ships no binary; it fetches the
 * correct release archive for the host at install time (postinstall) and, as a
 * fallback, on first run — so `npm install --ignore-scripts` still works. The
 * download is idempotent: once the verified binary exists, it is a no-op.
 */

const pkg = require('../package.json');
const vendorDir = path.join(__dirname, '..', 'vendor');

/** Absolute path to the (possibly not-yet-downloaded) platform binary. */
function vendorBinaryPath() {
  return path.join(vendorDir, binaryName(process.platform));
}

/** Hard deadline for each release download; bounds hangs without killing slow links. */
const REQUEST_TIMEOUT_MS = 300_000;

async function fetchBuffer(url) {
  const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!res.ok) {
    throw new Error(`download failed (${res.status} ${res.statusText}): ${url}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/** Extracts an archive with the system `tar` (bsdtar reads zip on Windows). */
function extract(archivePath, ext, destDir) {
  const args =
    ext === 'tar.gz'
      ? ['-xzf', archivePath, '-C', destDir]
      : ['-xf', archivePath, '-C', destDir];
  const result = spawnSync('tar', args, { stdio: ['ignore', 'inherit', 'inherit'] });
  if (result.error) {
    throw new Error(`failed to run tar: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`tar exited with ${result.status} extracting ${path.basename(archivePath)}`);
  }
}

/**
 * Ensures the verified platform binary exists locally and returns its path.
 *
 * # Errors
 *
 * Throws when the host platform is unsupported, a download fails, the archive's
 * SHA-256 does not match the published checksum, or the archive is malformed.
 */
async function ensureBinary() {
  const { platform, arch } = process;
  if (!isSupported(platform, arch)) {
    throw new Error(`@kqode/kqode-cli: no prebuilt executable is published for ${platform}-${arch}.`);
  }

  const target = vendorBinaryPath();
  if (fs.existsSync(target)) {
    return target;
  }

  const base = releaseBaseUrl(pkg.version);
  const relName = releaseTargetName(platform, arch);
  const ext = archiveExt(platform);
  const [archive, checksumText] = await Promise.all([
    fetchBuffer(`${base}/${relName}.${ext}`),
    fetchBuffer(`${base}/${relName}.sha256`).then((buf) => buf.toString('utf8'))
  ]);

  const expected = checksumText.trim().split(/\s+/)[0];
  const actual = sha256(archive);
  if (expected !== actual) {
    throw new Error(
      `@kqode/kqode-cli: checksum mismatch for ${relName}.${ext} (expected ${expected}, got ${actual}).`
    );
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kqode-dl-'));
  try {
    const archivePath = path.join(tmpDir, `${relName}.${ext}`);
    fs.writeFileSync(archivePath, archive);
    const extractDir = path.join(tmpDir, 'out');
    fs.mkdirSync(extractDir);
    extract(archivePath, ext, extractDir);

    const extracted = path.join(extractDir, binaryName(platform));
    if (!fs.existsSync(extracted)) {
      throw new Error(`@kqode/kqode-cli: ${relName}.${ext} did not contain ${binaryName(platform)}.`);
    }

    fs.mkdirSync(vendorDir, { recursive: true });
    // Copy rather than rename: tmpdir and the install prefix can be on different
    // filesystems (rename would EXDEV). Write to a temp name, then atomically
    // move into place so concurrent runs never see a half-written binary.
    const staged = `${target}.${process.pid}.tmp`;
    fs.copyFileSync(extracted, staged);
    if (platform !== 'win32') {
      fs.chmodSync(staged, 0o755);
    }
    fs.renameSync(staged, target);
    return target;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

module.exports = { ensureBinary, vendorBinaryPath };

if (require.main === module) {
  // postinstall: best-effort. If the network or platform is unavailable, do not
  // fail `npm install`; the binary is fetched lazily on first run instead.
  ensureBinary().then(
    (binary) => console.log(`kqode: installed ${path.basename(binary)}`),
    (error) => {
      console.warn(`kqode: deferring executable download to first run (${error.message})`);
      console.warn(`kqode: releases: https://github.com/${REPO}/releases`);
    }
  );
}
