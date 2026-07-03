'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  MAIN_PACKAGE,
  REPO,
  SUPPORTED_TARGETS,
  isSupported,
  binaryName,
  platformPackageName
} = require('./resolve.cjs');

/** Env var that points the launcher at an explicit executable (troubleshooting/manual installs). */
const BINARY_PATH_ENV = 'KQODE_BINARY_PATH';

/** Attaches a machine-readable `code` to an `Error` so callers can branch on the failure kind. */
function tagged(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

/**
 * Resolves the platform-specific `kqode` executable that npm installed as an
 * optional dependency, or an explicit override from `KQODE_BINARY_PATH`.
 *
 * The matching `@kqode/kqode-cli-<platform>-<arch>` package is located by
 * resolving its `package.json` with `require.resolve`, then returning the
 * executable beside it. No network access occurs. This relies on the platform
 * packages shipping the executable at their root with no restrictive `exports`
 * map (the generator guarantees this); a package that declared `exports` without
 * `"./package.json"` would fail with `ERR_PACKAGE_PATH_NOT_EXPORTED`, surfaced
 * distinctly below rather than as a spurious "not installed".
 *
 * # Errors
 *
 * Throws with `code` `KQODE_OVERRIDE_MISSING` when `KQODE_BINARY_PATH` points at
 * a nonexistent file, `KQODE_UNSUPPORTED` when the host has no published package,
 * `KQODE_MISSING_PACKAGE` when the matching platform package is not installed
 * (typically because optional dependencies were skipped), or
 * `KQODE_PACKAGE_EXPORTS` when the package is present but its `exports` map hides
 * `package.json` (an internal packaging error).
 */
function resolveBinary(platform = process.platform, arch = process.arch) {
  const override = process.env[BINARY_PATH_ENV];
  if (override) {
    if (!fs.existsSync(override)) {
      throw tagged(
        `${MAIN_PACKAGE}: ${BINARY_PATH_ENV} is set but ${override} does not exist.`,
        'KQODE_OVERRIDE_MISSING'
      );
    }
    return override;
  }

  if (!isSupported(platform, arch)) {
    throw tagged(
      `${MAIN_PACKAGE}: no prebuilt executable is published for ${platform}-${arch}.`,
      'KQODE_UNSUPPORTED'
    );
  }

  const pkg = platformPackageName(platform, arch);
  let manifest;
  try {
    manifest = require.resolve(`${pkg}/package.json`);
  } catch (cause) {
    // The package is installed but its `exports` map hides `package.json`; that
    // is a packaging bug, not a missing dependency, so report it distinctly.
    const exportsHidden = cause && cause.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED';
    const error = tagged(
      exportsHidden
        ? `${MAIN_PACKAGE}: the platform package ${pkg} is installed but hides its executable behind "exports".`
        : `${MAIN_PACKAGE}: the platform package ${pkg} is not installed.`,
      exportsHidden ? 'KQODE_PACKAGE_EXPORTS' : 'KQODE_MISSING_PACKAGE'
    );
    error.pkg = pkg;
    error.cause = cause;
    throw error;
  }
  return path.join(path.dirname(manifest), binaryName(platform));
}

/** Builds an actionable, multi-line message for a `resolveBinary` failure. */
function describeResolutionError(error) {
  const lines = [error.message];
  if (error.code === 'KQODE_UNSUPPORTED') {
    lines.push(`Supported targets: ${SUPPORTED_TARGETS.join(', ')}.`);
    lines.push(`See https://github.com/${REPO}/releases for manual downloads.`);
  } else if (error.code === 'KQODE_MISSING_PACKAGE') {
    lines.push('This usually means the install skipped optional dependencies.');
    lines.push('Reinstall without disabling them (avoid --omit=optional / --no-optional):');
    lines.push(`  npm install -g ${MAIN_PACKAGE}`);
    lines.push(`Or set ${BINARY_PATH_ENV} to a kqode executable downloaded from`);
    lines.push(`  https://github.com/${REPO}/releases`);
  } else if (error.code === 'KQODE_PACKAGE_EXPORTS') {
    lines.push('This is an internal packaging error; please report it at');
    lines.push(`  https://github.com/${REPO}/issues`);
    lines.push(`Meanwhile, set ${BINARY_PATH_ENV} to a kqode executable downloaded from`);
    lines.push(`  https://github.com/${REPO}/releases`);
  }
  return lines.join('\n');
}

module.exports = { resolveBinary, describeResolutionError, BINARY_PATH_ENV };
