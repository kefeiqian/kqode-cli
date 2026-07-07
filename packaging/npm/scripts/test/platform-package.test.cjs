'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  platformPackageManifest,
  platformPackageReadme,
  LICENSE_FILES,
  NOTICE_FILES,
  PACKAGE_SUPPORT_FILES
} = require('../platform-package.cjs');
const { releaseTargetName, archiveExt } = require('../release-target.cjs');

test('platformPackageManifest sets os/cpu and ships only the binary + support files', () => {
  const manifest = platformPackageManifest({
    name: '@kqode/kqode-cli-linux-x64',
    version: '1.2.3',
    platform: 'linux',
    arch: 'x64',
    binaryName: 'kqode'
  });
  assert.equal(manifest.name, '@kqode/kqode-cli-linux-x64');
  assert.equal(manifest.version, '1.2.3');
  assert.deepEqual(manifest.os, ['linux']);
  assert.deepEqual(manifest.cpu, ['x64']);
  assert.deepEqual(manifest.files, ['kqode', ...PACKAGE_SUPPORT_FILES]);
  assert.equal(manifest.preferUnplugged, true);
  assert.equal(manifest.license, 'MIT OR Apache-2.0');
});

test('platformPackageManifest omits exports and bin (launcher-critical invariants)', () => {
  const manifest = platformPackageManifest({
    name: '@kqode/kqode-cli-win32-x64',
    version: '1.2.3',
    platform: 'win32',
    arch: 'x64',
    binaryName: 'kqode.exe'
  });
  assert.ok(!('exports' in manifest), 'must not declare exports (breaks require.resolve of package.json)');
  assert.ok(!('bin' in manifest), 'must not declare bin (only the launcher exposes kqode)');
  assert.equal(manifest.files[0], 'kqode.exe');
});

test('platformPackageReadme names the target and points at the CLI', () => {
  const readme = platformPackageReadme({ name: '@kqode/kqode-cli-darwin-arm64', platform: 'darwin', arch: 'arm64' });
  assert.match(readme, /# @kqode\/kqode-cli-darwin-arm64/);
  assert.match(readme, /npm install -g @kqode\/kqode-cli/);
});

test('releaseTargetName maps win32-arm64 to the windows-x64 archive (emulation) and others 1:1', () => {
  assert.equal(releaseTargetName('linux', 'x64'), 'kqode-linux-x64');
  assert.equal(releaseTargetName('darwin', 'arm64'), 'kqode-darwin-arm64');
  assert.equal(releaseTargetName('win32', 'x64'), 'kqode-windows-x64');
  assert.equal(releaseTargetName('win32', 'arm64'), 'kqode-windows-x64');
});

test('archiveExt is zip on Windows and tar.gz elsewhere', () => {
  assert.equal(archiveExt('win32'), 'zip');
  assert.equal(archiveExt('linux'), 'tar.gz');
  assert.equal(archiveExt('darwin'), 'tar.gz');
});

test('LICENSE_FILES are the two dual-license files', () => {
  assert.deepEqual(LICENSE_FILES, ['LICENSE-APACHE', 'LICENSE-MIT']);
});

test('NOTICE_FILES contains third-party notices', () => {
  assert.deepEqual(NOTICE_FILES, ['THIRD_PARTY_NOTICES.md']);
});
