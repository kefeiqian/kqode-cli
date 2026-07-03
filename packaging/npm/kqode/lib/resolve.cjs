'use strict';

// Pure, I/O-free host → package mapping shared by the launcher (`bin/kqode.cjs`
// via `lib/locate.cjs`) and the release tooling. No network and no fs so the
// mapping stays trivially testable.

/** npm scope and the published launcher package. */
const SCOPE = '@kqode';
const MAIN_PACKAGE = `${SCOPE}/kqode-cli`;

/** GitHub repository that hosts the release archives (used only in error links). */
const REPO = 'kefeiqian/kqode-cli';

/**
 * Supported `${process.platform}-${process.arch}` targets. Each maps 1:1 to a
 * platform package `@kqode/kqode-cli-<platform>-<arch>` listed under the
 * launcher's `optionalDependencies`; npm installs only the one whose `os`/`cpu`
 * matches the host, so the binary ships with `npm install` — no download.
 *
 * `win32-arm64` has no native build yet: its platform package carries the
 * `win32-x64` executable, which Windows 11 on ARM runs via x64 emulation.
 */
const SUPPORTED_TARGETS = [
  'darwin-arm64',
  'linux-arm64',
  'linux-x64',
  'win32-arm64',
  'win32-x64'
];

/** Target key for a platform/arch pair, e.g. `win32-x64`. */
function platformKey(platform, arch) {
  return `${platform}-${arch}`;
}

/** Whether a platform/arch pair has a published platform package. */
function isSupported(platform, arch) {
  return SUPPORTED_TARGETS.includes(platformKey(platform, arch));
}

/** Executable file name for a platform, e.g. `kqode.exe` on Windows. */
function binaryName(platform) {
  return platform === 'win32' ? 'kqode.exe' : 'kqode';
}

/** Platform package name for a host, e.g. `@kqode/kqode-cli-win32-x64`. */
function platformPackageName(platform, arch) {
  return `${MAIN_PACKAGE}-${platformKey(platform, arch)}`;
}

module.exports = {
  SCOPE,
  MAIN_PACKAGE,
  REPO,
  SUPPORTED_TARGETS,
  platformKey,
  isSupported,
  binaryName,
  platformPackageName
};
