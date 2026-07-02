'use strict';

// Pure, I/O-free helpers shared by the launcher (`bin/kqode.cjs`) and the binary
// installer (`lib/install.cjs`). No network and no fs so the mapping stays
// trivially testable.

/** GitHub repository that hosts the release archives the CLI downloads. */
const REPO = 'kefeiqian/kqode-cli';

/**
 * Supported `${process.platform}-${process.arch}` targets.
 *
 * Each entry resolves to a `kqode-<os>-<arch>` release archive. Most map
 * directly; `win32-arm64` has no native build yet and resolves to the
 * `windows-x64` asset, which Windows 11 on ARM runs via x64 emulation (see
 * `releaseTargetName`).
 */
const SUPPORTED_TARGETS = [
  'darwin-arm64',
  'linux-arm64',
  'linux-x64',
  'win32-arm64',
  'win32-x64'
];

/** Maps Node's `process.platform` to the release-archive OS segment. */
const RELEASE_OS = { darwin: 'darwin', linux: 'linux', win32: 'windows' };

/**
 * Targets with no native release archive that reuse another target's asset.
 * Windows on ARM has no native build yet; Windows 11 on ARM runs the x64
 * executable via built-in emulation.
 */
const ASSET_OVERRIDES = { 'win32-arm64': { os: 'windows', arch: 'x64' } };

/** Target key for a platform/arch pair, e.g. `win32-x64`. */
function platformKey(platform, arch) {
  return `${platform}-${arch}`;
}

/** Whether a platform/arch pair has a published release archive. */
function isSupported(platform, arch) {
  return SUPPORTED_TARGETS.includes(platformKey(platform, arch));
}

/** Executable file name for a platform, e.g. `kqode.exe` on Windows. */
function binaryName(platform) {
  return platform === 'win32' ? 'kqode.exe' : 'kqode';
}

/** Release asset base name (no extension), e.g. `kqode-windows-x64`. */
function releaseTargetName(platform, arch) {
  const override = ASSET_OVERRIDES[platformKey(platform, arch)];
  const assetOs = override ? override.os : RELEASE_OS[platform];
  const assetArch = override ? override.arch : arch;
  return `kqode-${assetOs}-${assetArch}`;
}

/** Release archive extension for a platform: `zip` on Windows, else `tar.gz`. */
function archiveExt(platform) {
  return platform === 'win32' ? 'zip' : 'tar.gz';
}

/** Base URL of the GitHub Release assets for a version (no trailing slash). */
function releaseBaseUrl(version) {
  return `https://github.com/${REPO}/releases/download/v${version}`;
}

module.exports = {
  REPO,
  SUPPORTED_TARGETS,
  RELEASE_OS,
  platformKey,
  isSupported,
  binaryName,
  releaseTargetName,
  archiveExt,
  releaseBaseUrl
};
