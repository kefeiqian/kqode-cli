'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { resolveBinary, describeResolutionError, BINARY_PATH_ENV } = require('../lib/locate.cjs');

/** Runs `fn` with `KQODE_BINARY_PATH` set to `value`, restoring the prior value. */
function withBinaryPath(value, fn) {
  const previous = process.env[BINARY_PATH_ENV];
  if (value === undefined) {
    delete process.env[BINARY_PATH_ENV];
  } else {
    process.env[BINARY_PATH_ENV] = value;
  }
  try {
    fn();
  } finally {
    if (previous === undefined) {
      delete process.env[BINARY_PATH_ENV];
    } else {
      process.env[BINARY_PATH_ENV] = previous;
    }
  }
}

test('resolveBinary returns KQODE_BINARY_PATH when the file exists', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kqode-locate-'));
  const exe = path.join(dir, 'kqode');
  fs.writeFileSync(exe, '');
  try {
    withBinaryPath(exe, () => {
      assert.equal(resolveBinary('linux', 'x64'), exe);
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('resolveBinary rejects a missing KQODE_BINARY_PATH override', () => {
  withBinaryPath(path.join(os.tmpdir(), 'kqode-does-not-exist-xyz'), () => {
    assert.throws(() => resolveBinary('linux', 'x64'), (error) => error.code === 'KQODE_OVERRIDE_MISSING');
  });
});

test('resolveBinary rejects an unsupported host', () => {
  withBinaryPath(undefined, () => {
    assert.throws(() => resolveBinary('sunos', 'x64'), (error) => error.code === 'KQODE_UNSUPPORTED');
  });
});

test('resolveBinary reports a missing platform package', () => {
  // No @kqode/kqode-cli-* optional dependency is installed in this checkout,
  // so a supported host still cannot resolve its binary.
  withBinaryPath(undefined, () => {
    assert.throws(() => resolveBinary('linux', 'x64'), (error) => error.code === 'KQODE_MISSING_PACKAGE');
  });
});

test('resolveBinary distinguishes a package that hides package.json behind exports', () => {
  // Simulate an installed platform package whose `exports` omit `./package.json`;
  // Node then throws ERR_PACKAGE_PATH_NOT_EXPORTED, which must be reported as a
  // packaging error rather than a spurious "not installed".
  const pkgDir = path.join(__dirname, '..', 'node_modules', '@kqode', 'kqode-cli-linux-arm64');
  fs.mkdirSync(pkgDir, { recursive: true });
  fs.writeFileSync(
    path.join(pkgDir, 'package.json'),
    JSON.stringify({ name: '@kqode/kqode-cli-linux-arm64', version: '0.0.0', exports: { '.': './kqode' } })
  );
  fs.writeFileSync(path.join(pkgDir, 'kqode'), '');
  try {
    withBinaryPath(undefined, () => {
      assert.throws(() => resolveBinary('linux', 'arm64'), (error) => error.code === 'KQODE_PACKAGE_EXPORTS');
    });
  } finally {
    fs.rmSync(path.join(__dirname, '..', 'node_modules'), { recursive: true, force: true });
  }
});

test('describeResolutionError gives actionable guidance per failure kind', () => {
  const unsupported = describeResolutionError(Object.assign(new Error('no build'), { code: 'KQODE_UNSUPPORTED' }));
  assert.match(unsupported, /Supported targets:/);
  assert.match(unsupported, /releases/);

  const missing = describeResolutionError(Object.assign(new Error('not installed'), { code: 'KQODE_MISSING_PACKAGE' }));
  assert.match(missing, /optional dependencies/);
  assert.match(missing, /npm install -g @kqode\/kqode-cli/);

  const exportsHidden = describeResolutionError(Object.assign(new Error('hidden'), { code: 'KQODE_PACKAGE_EXPORTS' }));
  assert.match(exportsHidden, /internal packaging error/);
  assert.match(exportsHidden, /issues/);
});
