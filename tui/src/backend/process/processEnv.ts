import { KQODE_DEBUG_ENV_VAR, KQODE_LOG_DIR_ENV_VAR } from '@constants/backend.ts';

/**
 * Builds a hardened environment for source-mode Cargo build and backend launch.
 *
 * A strict allowlist replaces the inherited environment so secret-bearing
 * variables (provider keys, registry tokens, SSH agent handles) never reach the
 * Rust child. Cargo/Rustup variables are added only when a build needs them.
 */
const WINDOWS_ALLOWLIST = [
  'PATH',
  'PATHEXT',
  'SYSTEMROOT',
  'WINDIR',
  'TEMP',
  'TMP',
  'USERPROFILE',
  'HOMEDRIVE',
  'HOMEPATH',
  'HOME'
];

const UNIX_ALLOWLIST = ['PATH', 'HOME', 'TMPDIR', 'TERM', 'COLORTERM', 'LANG', 'LC_ALL', 'LC_CTYPE'];

const CARGO_ALLOWLIST = ['CARGO_HOME', 'RUSTUP_HOME', 'RUSTUP_TOOLCHAIN'];

// Non-secret KQode runtime toggles that must reach the spawned backend: the
// debug-logging switch and its optional log-directory override. Passing these
// through (rather than a provider key like KIMI_API_KEY, which stays out of the
// allowlist and is read from `.env`) is safe and lets `--debug` / `KQODE_DEBUG`
// enable backend logging in packaged builds.
const KQODE_RUNTIME_ALLOWLIST = [KQODE_DEBUG_ENV_VAR, KQODE_LOG_DIR_ENV_VAR];

export type HardenedEnvOptions = {
  includeCargo?: boolean;
  platform?: NodeJS.Platform;
  source?: NodeJS.ProcessEnv;
};

export function buildHardenedEnv({
  includeCargo = false,
  platform = process.platform,
  source = process.env
}: HardenedEnvOptions = {}): NodeJS.ProcessEnv {
  const baseAllowlist = platform === 'win32' ? WINDOWS_ALLOWLIST : UNIX_ALLOWLIST;
  const allowed = new Set(
    [
      ...baseAllowlist,
      ...KQODE_RUNTIME_ALLOWLIST,
      ...(includeCargo ? CARGO_ALLOWLIST : [])
    ].map((name) => name.toUpperCase())
  );

  const hardened: NodeJS.ProcessEnv = {};
  for (const [name, value] of Object.entries(source)) {
    if (value === undefined) {
      continue;
    }
    if (allowed.has(name.toUpperCase())) {
      hardened[name] = value;
    }
  }

  return hardened;
}
