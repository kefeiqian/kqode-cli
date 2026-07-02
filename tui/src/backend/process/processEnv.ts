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
    [...baseAllowlist, ...(includeCargo ? CARGO_ALLOWLIST : [])].map((name) => name.toUpperCase())
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
