import { KQODE_DEBUG_ENV_VAR } from '@constants/backend.ts';

/** Values that explicitly enable logging (mirrors `is_truthy` in `src/debug_log.rs`). */
const TRUTHY_VALUES = new Set(['1', 'true', 'on', 'yes']);

/**
 * Whether TUI session logging should run for this process.
 *
 * A non-empty `KQODE_DEBUG` wins (`1`/`true`/`on`/`yes` enable, anything else
 * disables); when it is unset or empty, logging defaults on in dev builds and
 * off in packaged/prod builds. Mirrors `logging_enabled` in `src/debug_log.rs`
 * so the two sides of a session are enabled or disabled together.
 */
export function loggingEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env[KQODE_DEBUG_ENV_VAR];
  if (raw !== undefined && raw.trim() !== '') {
    return TRUTHY_VALUES.has(raw.trim().toLowerCase());
  }
  return __DEV__;
}
