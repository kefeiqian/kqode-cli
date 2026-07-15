/**
 * Builds a hardened environment for source-mode Cargo build and backend launch.
 *
 * A strict allowlist replaces the inherited environment so secret-bearing
 * variables (provider keys, registry tokens, SSH agent handles) never reach the
 * Rust child. Cargo/Rustup variables are added only when a build needs them.
 *
 * The allowlist still admits the OS config/data roots the backend's git/GitHub
 * tooling needs to *locate* its credentials — notably `APPDATA` on Windows and
 * the `XDG_*` roots on Unix, where `gh` stores its host auth config. These are
 * directory paths, not secrets; omitting them makes `gh pr view` fail auth and
 * silently drops the PR segment from the status line.
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
  'HOME',
  // `gh` reads its auth config from %APPDATA%\GitHub CLI and its state/cache
  // from %LOCALAPPDATA%\GitHub CLI; without these it cannot authenticate.
  'APPDATA',
  'LOCALAPPDATA'
];

const UNIX_ALLOWLIST = [
  'PATH',
  'HOME',
  'TMPDIR',
  'TERM',
  'COLORTERM',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  // XDG roots `gh` honors for its config/state/data (falling back to ~/.config
  // etc.); pass them through so a customized layout still resolves gh auth.
  'XDG_CONFIG_HOME',
  'XDG_STATE_HOME',
  'XDG_DATA_HOME'
];

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
