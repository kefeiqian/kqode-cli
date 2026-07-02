/**
 * Build-time environment flags, injected as bare boolean globals so the packaged
 * (`__PROD__`) build dead-code-eliminates dev/test-only code. Exactly one is true:
 *
 * - `__PROD__` — packaged `bun build --compile` binary
 * - `__TEST__` — the Vitest runtime
 * - `__DEV__`  — source checkout run with `tsx` (the default)
 *
 * Injected per environment: Bun `--define` (prod, `scripts/buildPackaged.ts`),
 * `vitest.config.ts` `define` (test), and `src/devGlobals.ts` imported first by
 * `main.tsx` (dev). Mirrors the Rust `__DEV__` / `__PROD__` cfgs and the built-in
 * `cfg(test)` in `src/build_env.rs`.
 *
 * Gate with the bare identifiers (`if (__PROD__)`, `__TEST__ ? … : …`) so the
 * `--define` boolean folds and the dead branch is eliminated — never wrap them
 * in a helper, which would defeat the fold.
 */

export {};

declare global {
  var __DEV__: boolean;
  var __TEST__: boolean;
  var __PROD__: boolean;
}
