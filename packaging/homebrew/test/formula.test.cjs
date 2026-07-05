'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { renderFormula, FORMULA_TARGETS } = require('../formula.cjs');
const { parseChecksums } = require('../generate-formula.cjs');

const CHECKSUMS = {
  'kqode-darwin-arm64.tar.gz': 'a'.repeat(64),
  'kqode-linux-arm64.tar.gz': 'b'.repeat(64),
  'kqode-linux-x64.tar.gz': 'c'.repeat(64)
};

test('renders the class, version, and dual license', () => {
  const formula = renderFormula({ version: '1.2.3', checksums: CHECKSUMS });
  assert.match(formula, /class Kqode < Formula/);
  assert.match(formula, /version "1\.2\.3"/);
  assert.match(formula, /license "MIT OR Apache-2\.0"/);
});

test('pins every POSIX archive URL and checksum for the version', () => {
  const formula = renderFormula({ version: '1.2.3', checksums: CHECKSUMS });
  for (const target of FORMULA_TARGETS) {
    assert.ok(
      formula.includes(`releases/download/v1.2.3/${target.archive}`),
      `expected URL for ${target.archive}`
    );
    assert.ok(formula.includes(CHECKSUMS[target.archive]), `expected sha for ${target.archive}`);
  }
});

test('guards macOS to arm64 only and gives Linux both arches', () => {
  const formula = renderFormula({ version: '1.2.3', checksums: CHECKSUMS });
  const macos = formula.slice(formula.indexOf('on_macos'), formula.indexOf('on_linux'));
  assert.match(macos, /on_arm do/);
  assert.doesNotMatch(macos, /on_intel do/); // Intel macOS is not distributed
  const linux = formula.slice(formula.indexOf('on_linux'));
  assert.match(linux, /on_arm do/);
  assert.match(linux, /on_intel do/);
});

test('emits the install and smoke-test blocks', () => {
  const formula = renderFormula({ version: '1.2.3', checksums: CHECKSUMS });
  assert.match(formula, /bin\.install "kqode"/);
  assert.match(formula, /system bin\/"kqode", "--version"/);
});

test('throws when a required checksum is missing', () => {
  assert.throws(
    () => renderFormula({ version: '1.2.3', checksums: {} }),
    /missing checksum for kqode-darwin-arm64\.tar\.gz/
  );
});

test('throws when no version is provided', () => {
  assert.throws(() => renderFormula({ checksums: CHECKSUMS }), /requires a version/);
});

test('parseChecksums reads both two-space and binary-mode lines', () => {
  const text = [
    `${'d'.repeat(64)}  kqode-darwin-arm64.tar.gz`,
    `${'e'.repeat(64)} *kqode-linux-x64.tar.gz`,
    '',
    'not-a-checksum-line'
  ].join('\n');
  const map = parseChecksums(text);
  assert.equal(map['kqode-darwin-arm64.tar.gz'], 'd'.repeat(64));
  assert.equal(map['kqode-linux-x64.tar.gz'], 'e'.repeat(64));
  assert.equal(Object.keys(map).length, 2);
});
