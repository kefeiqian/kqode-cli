/**
 * Names of the build-time environment variables the packaged (`prod`) build
 * injects via Bun `--define` and the TUI reads through `process.env`.
 *
 * The dev/test/prod *selection* is the `__DEV__` / `__TEST__` / `__PROD__`
 * boolean flags declared in `src/globals.d.ts`; these two are the string values
 * carried alongside a `prod` build.
 */

/** Build-time env var carrying the product version (injected in `prod`). */
export const VERSION_ENV_VAR = 'KQODE_VERSION';

/** Build-time env var carrying the embedded backend asset SHA-256 (`prod` only). */
export const BACKEND_SHA256_ENV_VAR = 'KQODE_BACKEND_SHA256';
