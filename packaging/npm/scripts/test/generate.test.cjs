'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { buildPackage, parseArgs } = require('../generate-platform-packages.cjs');

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

/**
 * Stages a fake executable and archives it as `<relName>.<ext>` plus a matching
 * `<relName>.sha256` in `dir`. Returns the archive path, or `null` when this
 * runner's `tar` cannot create the requested format (e.g. GNU tar + zip on Linux).
 */
function makeArchive(dir, relName, ext, binName, contents) {
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'kqode-stage-'));
  fs.writeFileSync(path.join(stage, binName), contents);
  const archivePath = path.join(dir, `${relName}.${ext}`);
  const result =
    ext === 'tar.gz'
      ? spawnSync('tar', ['-czf', archivePath, '-C', stage, binName], { stdio: 'ignore' })
      : spawnSync('zip', ['-q', archivePath, binName], { cwd: stage, stdio: 'ignore' });
  const fallback =
    ext === 'zip' && result.error
      ? spawnSync('tar', ['-a', '-cf', archivePath, '-C', stage, binName], { stdio: 'ignore' })
      : result;
  fs.rmSync(stage, { recursive: true, force: true });
  if (fallback.error || fallback.status !== 0) return null;
  fs.writeFileSync(path.join(dir, `${relName}.sha256`), `${sha256(archivePath)}  ${relName}.${ext}\n`);
  return archivePath;
}

/** Runs `fn` with fresh temp `archives`/`out` directories, cleaning both up after. */
function withDirs(fn) {
  const archives = fs.mkdtempSync(path.join(os.tmpdir(), 'kqode-arch-'));
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'kqode-out-'));
  try {
    fn({ archives, out });
  } finally {
    fs.rmSync(archives, { recursive: true, force: true });
    fs.rmSync(out, { recursive: true, force: true });
  }
}

test('parseArgs handles --key=value and --key value', () => {
  const args = parseArgs(['--archives=/a', '--out', '/b', '--version', '1.0.0']);
  assert.equal(args.get('archives'), '/a');
  assert.equal(args.get('out'), '/b');
  assert.equal(args.get('version'), '1.0.0');
});

test('buildPackage assembles a posix platform package from a verified tar.gz', () => {
  withDirs(({ archives, out }) => {
    makeArchive(archives, 'kqode-linux-x64', 'tar.gz', 'kqode', 'ELF-ish payload');
    const { name, dir } = buildPackage({
      platform: 'linux',
      arch: 'x64',
      version: '9.9.9',
      archivesDir: archives,
      outDir: out
    });
    assert.equal(name, '@kqode/kqode-cli-linux-x64');

    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    assert.equal(manifest.name, '@kqode/kqode-cli-linux-x64');
    assert.equal(manifest.version, '9.9.9');
    assert.deepEqual(manifest.os, ['linux']);
    assert.deepEqual(manifest.cpu, ['x64']);
    assert.ok(!('exports' in manifest));
    assert.ok(!('bin' in manifest));

    assert.equal(fs.readFileSync(path.join(dir, 'kqode'), 'utf8'), 'ELF-ish payload');
    for (const file of ['LICENSE-APACHE', 'LICENSE-MIT', 'README.md']) {
      assert.ok(fs.existsSync(path.join(dir, file)), `${file} should be present`);
    }
  });
});

test('buildPackage rejects a checksum mismatch', () => {
  withDirs(({ archives, out }) => {
    makeArchive(archives, 'kqode-linux-x64', 'tar.gz', 'kqode', 'payload');
    fs.writeFileSync(path.join(archives, 'kqode-linux-x64.sha256'), `${'0'.repeat(64)}  kqode-linux-x64.tar.gz\n`);
    assert.throws(
      () => buildPackage({ platform: 'linux', arch: 'x64', version: '9.9.9', archivesDir: archives, outDir: out }),
      /checksum mismatch/
    );
  });
});

test('buildPackage rejects a missing checksum file', () => {
  withDirs(({ archives, out }) => {
    makeArchive(archives, 'kqode-linux-x64', 'tar.gz', 'kqode', 'payload');
    fs.rmSync(path.join(archives, 'kqode-linux-x64.sha256'));
    assert.throws(
      () => buildPackage({ platform: 'linux', arch: 'x64', version: '9.9.9', archivesDir: archives, outDir: out }),
      /missing checksum file/
    );
  });
});

test('buildPackage maps win32-arm64 to the windows-x64 zip (emulation)', (t) => {
  withDirs(({ archives, out }) => {
    const made = makeArchive(archives, 'kqode-windows-x64', 'zip', 'kqode.exe', 'PE payload');
    if (!made) {
      t.skip('this runner cannot create zip archives with tar');
      return;
    }

    const x64 = buildPackage({ platform: 'win32', arch: 'x64', version: '9.9.9', archivesDir: archives, outDir: out });
    const arm64 = buildPackage({ platform: 'win32', arch: 'arm64', version: '9.9.9', archivesDir: archives, outDir: out });

    assert.equal(arm64.name, '@kqode/kqode-cli-win32-arm64');
    const arm64Manifest = JSON.parse(fs.readFileSync(path.join(arm64.dir, 'package.json'), 'utf8'));
    assert.deepEqual(arm64Manifest.os, ['win32']);
    assert.deepEqual(arm64Manifest.cpu, ['arm64']);
    // Both Windows packages carry the same x64 executable.
    assert.equal(fs.readFileSync(path.join(arm64.dir, 'kqode.exe'), 'utf8'), 'PE payload');
    assert.equal(fs.readFileSync(path.join(x64.dir, 'kqode.exe'), 'utf8'), 'PE payload');
  });
});
