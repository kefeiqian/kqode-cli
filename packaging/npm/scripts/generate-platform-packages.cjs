#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const { SUPPORTED_TARGETS, binaryName, platformPackageName } = require('../kqode/lib/resolve.cjs');
const { releaseTargetName, archiveExt } = require('./release-target.cjs');
const { platformPackageManifest, platformPackageReadme, LICENSE_FILES, NOTICE_FILES } = require('./platform-package.cjs');

/** The committed launcher package, source of the default version and the LICENSE files. */
const packageRoot = path.join(__dirname, '..', 'kqode');

/** Parses `--key value` and `--key=value` flags into a Map (bare flags become `'true'`). */
function parseArgs(argv) {
  const args = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const eq = token.indexOf('=');
    if (eq !== -1) {
      args.set(token.slice(2, eq), token.slice(eq + 1));
    } else if (argv[i + 1] && !argv[i + 1].startsWith('--')) {
      args.set(token.slice(2), argv[(i += 1)]);
    } else {
      args.set(token.slice(2), 'true');
    }
  }
  return args;
}

function run(cmd, cmdArgs) {
  const result = spawnSync(cmd, cmdArgs, { stdio: ['ignore', 'inherit', 'inherit'] });
  if (result.error) throw new Error(`failed to run ${cmd}: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${cmd} exited with ${result.status}`);
}

/** Whether a command is runnable, used to prefer `unzip` for zips with a bsdtar fallback. */
function hasCommand(cmd) {
  return !spawnSync(cmd, ['--version'], { stdio: 'ignore' }).error;
}

/** Extracts `archivePath` into `destDir`; handles `.tar.gz` and `.zip` on every runner. */
function extract(archivePath, ext, destDir) {
  if (ext === 'tar.gz') {
    run('tar', ['-xzf', archivePath, '-C', destDir]);
  } else if (hasCommand('unzip')) {
    run('unzip', ['-o', '-q', archivePath, '-d', destDir]);
  } else {
    run('tar', ['-xf', archivePath, '-C', destDir]); // bsdtar (macOS/Windows) reads zip
  }
}

/**
 * Verifies `archivePath` against `sha256Path`'s published checksum.
 *
 * # Errors
 *
 * Throws when the checksum file is missing (so a tampered/incomplete download
 * cannot pass silently) or the digest does not match.
 */
function verifyChecksum(archivePath, sha256Path) {
  if (!fs.existsSync(sha256Path)) {
    throw new Error(`missing checksum file ${path.basename(sha256Path)} for ${path.basename(archivePath)}`);
  }
  const expected = fs.readFileSync(sha256Path, 'utf8').trim().split(/\s+/)[0];
  const actual = crypto.createHash('sha256').update(fs.readFileSync(archivePath)).digest('hex');
  if (expected !== actual) {
    throw new Error(`checksum mismatch for ${path.basename(archivePath)} (expected ${expected}, got ${actual})`);
  }
}

/**
 * Assembles the platform package for one `<platform>-<arch>` target under
 * `<outDir>/<platform>-<arch>/` and returns its `{ name, dir }`.
 *
 * Extracts the executable from the mapped `kqode-<os>-<arch>` archive (after
 * verifying its SHA-256), then writes `package.json`, the executable, the two
 * LICENSE/notice files, and a short README.
 *
 * # Errors
 *
 * Throws when the mapped archive or its checksum is missing, verification fails,
 * or the archive does not contain the expected executable.
 */
function buildPackage({ platform, arch, version, archivesDir, outDir }) {
  const name = platformPackageName(platform, arch);
  const bin = binaryName(platform);
  const relName = releaseTargetName(platform, arch);
  const ext = archiveExt(platform);
  const archivePath = path.join(archivesDir, `${relName}.${ext}`);
  if (!fs.existsSync(archivePath)) {
    throw new Error(`release archive not found: ${archivePath}`);
  }
  verifyChecksum(archivePath, path.join(archivesDir, `${relName}.sha256`));

  const pkgDir = path.join(outDir, `${platform}-${arch}`);
  fs.mkdirSync(pkgDir, { recursive: true });

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kqode-gen-'));
  try {
    extract(archivePath, ext, tmpDir);
    const extracted = path.join(tmpDir, bin);
    if (!fs.existsSync(extracted)) {
      throw new Error(`${path.basename(archivePath)} did not contain ${bin}`);
    }
    const dest = path.join(pkgDir, bin);
    fs.copyFileSync(extracted, dest);
    if (platform !== 'win32') fs.chmodSync(dest, 0o755);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  const manifest = platformPackageManifest({ name, version, platform, arch, binaryName: bin });
  fs.writeFileSync(path.join(pkgDir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  fs.writeFileSync(path.join(pkgDir, 'README.md'), platformPackageReadme({ name, platform, arch }));
  for (const file of [...LICENSE_FILES, ...NOTICE_FILES]) {
    fs.copyFileSync(path.join(packageRoot, file), path.join(pkgDir, file));
  }
  return { name, dir: pkgDir };
}

/**
 * Generates every supported platform package from a directory of release
 * archives. `--archives <dir>` is required; `--out <dir>` defaults to
 * `packaging/npm/dist-packages` and `--version <x.y.z>` to the launcher package's
 * version.
 */
function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const archivesDir = args.get('archives');
  if (!archivesDir) throw new Error('missing required --archives <dir>');
  const version = args.get('version') ?? require(path.join(packageRoot, 'package.json')).version;
  const outDir = args.get('out') ?? path.join(__dirname, '..', 'dist-packages');

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  const written = SUPPORTED_TARGETS.map((target) => {
    const [platform, arch] = target.split('-');
    return buildPackage({ platform, arch, version, archivesDir, outDir });
  });

  console.log(`Generated ${written.length} platform packages (version ${version}) in ${outDir}:`);
  for (const { name, dir } of written) console.log(`  ${name} -> ${dir}`);
  return written;
}

module.exports = { main, buildPackage, parseArgs, extract, verifyChecksum };

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`generate-platform-packages: ${error.message}`);
    process.exit(1);
  }
}
