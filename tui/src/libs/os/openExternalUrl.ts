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
 * Pure and separated from the spawn so the mapping is unit-testable. The argv
 * form (never a shell string) keeps the URL from being reinterpreted as extra
 * arguments; combined with the http(s) check it blocks command injection from a
 * hostile URL.
 */
export function resolveOpenCommand(
  url: string,
  platform: NodeJS.Platform = process.platform
): OpenCommand | null {
  if (!isOpenableUrl(url)) {
    return null;
  }
  if (platform === 'win32') {
    // `start` treats its first quoted argument as the window title, so pass an
    // empty title before the url.
    return { command: 'cmd', args: ['/c', 'start', '', url] };
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
) => { unref: () => void };

/**
 * Opens `url` in the user's default browser as a detached, unref'd process.
 *
 * Returns whether a launch was attempted: `false` for a non-openable URL or a
 * spawn failure. Best-effort by design — KQode owns the terminal input loop, so
 * a failed open must never throw into it.
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
    spawnProcess(resolved.command, resolved.args, { stdio: 'ignore', detached: true }).unref();
    return true;
  } catch {
    return false;
  }
}
