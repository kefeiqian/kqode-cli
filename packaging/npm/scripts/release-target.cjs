'use strict';

// Release-archive mapping used only by the publish tooling (not shipped in the
// launcher package): which GitHub Release archive a given host's binary is
// extracted from. Kept next to the generator and separate from the runtime-only
// `kqode/lib/resolve.cjs`.

const { platformKey } = require('../kqode/lib/resolve.cjs');

/** Maps Node's `process.platform` to the release-archive OS segment. */
const RELEASE_OS = { darwin: 'darwin', linux: 'linux', win32: 'windows' };

/**
 * Targets with no native archive that reuse another target's asset. Windows on
 * ARM has no native build yet; its package carries the Windows x64 executable,
 * which Windows 11 on ARM runs via emulation.
 */
const ASSET_OVERRIDES = { 'win32-arm64': { os: 'windows', arch: 'x64' } };

/** Release asset base name (no extension) whose binary feeds a platform package, e.g. `kqode-windows-x64`. */
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

module.exports = { RELEASE_OS, ASSET_OVERRIDES, releaseTargetName, archiveExt };
