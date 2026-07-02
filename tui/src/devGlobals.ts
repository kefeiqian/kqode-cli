/**
 * Dev-only global shim. `tsx` (which runs the `main.tsx` dev entry) performs no
 * build-time `--define`, so — unlike the packaged (`prod`) and Vitest (`test`)
 * builds — the `__DEV__` / `__TEST__` / `__PROD__` flags would be undefined and a
 * bare read would throw `ReferenceError`. `main.tsx` imports this module first so
 * the flags exist before any app module runs.
 *
 * Not reachable from the packaged entry (`packaged/entry.packaged.tsx`), so it
 * never lands in the prod bundle.
 */
globalThis.__DEV__ = true;
globalThis.__TEST__ = false;
globalThis.__PROD__ = false;
