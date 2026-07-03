'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  MAIN_PACKAGE,
  binaryName,
  isSupported,
  platformKey,
  platformPackageName,
  SUPPORTED_TARGETS
} = require('../lib/resolve.cjs');

test('platformKey joins platform and arch', () => {
  assert.equal(platformKey('win32', 'x64'), 'win32-x64');
});

test('platformPackageName names the per-host optional dependency', () => {
  assert.equal(platformPackageName('win32', 'x64'), '@kqode/kqode-cli-win32-x64');
  assert.equal(platformPackageName('darwin', 'arm64'), '@kqode/kqode-cli-darwin-arm64');
  assert.equal(platformPackageName('linux', 'x64'), '@kqode/kqode-cli-linux-x64');
  assert.equal(platformPackageName('win32', 'arm64'), '@kqode/kqode-cli-win32-arm64');
});

test('every supported target maps to a distinct platform package under the main scope', () => {
  const names = new Set();
  for (const target of SUPPORTED_TARGETS) {
    const [platform, arch] = target.split('-');
    const name = platformPackageName(platform, arch);
    assert.ok(name.startsWith(`${MAIN_PACKAGE}-`), `${name} should be scoped under ${MAIN_PACKAGE}`);
    names.add(name);
  }
  assert.equal(names.size, SUPPORTED_TARGETS.length);
});

test('binaryName appends .exe only on Windows', () => {
  assert.equal(binaryName('win32'), 'kqode.exe');
  assert.equal(binaryName('linux'), 'kqode');
  assert.equal(binaryName('darwin'), 'kqode');
});

test('isSupported matches exactly the five published targets', () => {
  assert.equal(SUPPORTED_TARGETS.length, 5);
  for (const target of SUPPORTED_TARGETS) {
    const [platform, arch] = target.split('-');
    assert.ok(isSupported(platform, arch), `${target} should be supported`);
  }
  assert.ok(!isSupported('darwin', 'x64'));
  assert.ok(!isSupported('linux', 'ia32'));
  assert.ok(!isSupported('sunos', 'x64'));
});
