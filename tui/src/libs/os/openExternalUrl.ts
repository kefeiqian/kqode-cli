import { spawn } from 'node:child_process';

const OPENABLE_PROTOCOLS = new Set(['http:', 'https:']);

/** Whether `url` is a well-formed http(s) URL safe to hand to the OS opener. */
export function isOpenableUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return OPENABLE_PROTOCOLS.has(parsed.protocol);
}

/** A command and its argument vector for launching the platform URL opener. */
export type OpenCommand = { command: string; args: string[] };

/**
 * The platform command + argv that opens `url` in the default browser, or `null`
 * when `url` is not an openable http(s) URL.
 *
 * Every platform uses a non-shell opener (`explorer.exe` / `open` / `xdg-open`)
 * invoked directly — never `cmd` or a shell string — so URL metacharacters such
 * as the `&` between query parameters are handed to the opener literally and
 * cannot be reinterpreted as extra commands. Combined with the http(s) allowlist
 * in {@link isOpenableUrl}, this blocks command injection from a hostile URL.
 */
export function resolveOpenCommand(
  url: string,
  platform: NodeJS.Platform = process.platform
): OpenCommand | null {
  if (!isOpenableUrl(url)) {
    return null;
  }
  if (platform === 'win32') {
    return { command: 'explorer.exe', args: [url] };
  }
  if (platform === 'darwin') {
    return { command: 'open', args: [url] };
  }
  return { command: 'xdg-open', args: [url] };
}

/** Minimal spawn seam so tests can observe the launch without a real process. */
export type ProcessSpawner = (
  command: string,
  args: string[],
  options: { stdio: 'ignore'; detached: true }
) => {
  on: (event: 'error', listener: (error: Error) => void) => void;
  unref: () => void;
};

/**
 * Opens `url` in the user's default browser as a detached, unref'd process.
 *
 * Returns whether a launch was attempted: `false` for a non-openable URL or a
 * synchronous spawn failure. Best-effort by design — KQode owns the terminal
 * input loop, so a failure must never throw into it. A missing opener binary is
 * reported asynchronously via the child's `error` event (e.g. Linux without
 * `xdg-open`), so an `error` listener is attached to swallow it rather than let
 * it surface as an uncaught exception.
 */
export function openExternalUrl(
  url: string,
  platform: NodeJS.Platform = process.platform,
  spawnProcess: ProcessSpawner = (command, args, options) => spawn(command, args, options)
): boolean {
  const resolved = resolveOpenCommand(url, platform);
  if (resolved === null) {
    return false;
  }
  try {
    const child = spawnProcess(resolved.command, resolved.args, {
      stdio: 'ignore',
      detached: true
    });
    child.on('error', () => {});
    child.unref();
    return true;
  } catch {
    return false;
  }
}
