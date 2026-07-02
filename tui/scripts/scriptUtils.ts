import { resolveProductVersion } from '../src/libs/product/productMetadata.ts';

/**
 * Shared helpers for the packaging scripts (`buildPackaged.ts`, `packageRelease.ts`).
 *
 * These Bun entry points live outside the typechecked `src/` graph, so they use
 * relative imports and centralize host-platform concerns (exe suffix, argument
 * parsing, product version) here instead of duplicating them per script.
 */

/** Windows executables carry a `.exe` suffix; POSIX platforms use none. */
export const exeSuffix = process.platform === 'win32' ? '.exe' : '';

/** Parses `--key=value` CLI tokens into a map, rejecting any other token shape. */
export function parseArgs(argv: string[]): Map<string, string> {
  const args = new Map<string, string>();
  for (const arg of argv) {
    const match = /^--([^=]+)=(.*)$/.exec(arg);
    if (match === null) {
      throw new Error(`unrecognized argument: ${arg} (use --key=value)`);
    }
    args.set(match[1], match[2]);
  }
  return args;
}

export { resolveProductVersion };
