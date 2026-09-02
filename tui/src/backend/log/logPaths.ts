import os from 'node:os';
import path from 'node:path';

import { KQODE_HOME_DIRNAME } from '@backend/packaged/backendCacheDir.ts';
import { KQODE_LOG_DIR_ENV_VAR } from '@constants/backend.ts';

/** Subdirectory under the KQode home holding runtime logs. Mirrors `LOGS_DIRNAME`. */
const LOGS_DIRNAME = 'logs';

/** Filename of the per-session TUI log, a sibling of the backend's `backend.jsonl`. */
export const TUI_LOG_FILENAME = 'tui.jsonl';

/**
 * Resolves the logs root: `KQODE_LOG_DIR` if set, else `~/.kqode/logs`.
 * Mirrors `resolve_log_dir` in `src/debug_log.rs` so the TUI writes alongside
 * the backend's per-session directory.
 */
export function resolveLogsRoot(
  env: NodeJS.ProcessEnv = process.env,
  homeDir: string = os.homedir()
): string {
  const override = env[KQODE_LOG_DIR_ENV_VAR];
  if (override !== undefined && override.trim() !== '') {
    return override;
  }
  return path.join(homeDir, KQODE_HOME_DIRNAME, LOGS_DIRNAME);
}

/** Directory holding a named session's `tui.jsonl`: `<logsRoot>/<sessionId>`. */
export function sessionLogDir(sessionId: string, env?: NodeJS.ProcessEnv): string {
  return path.join(resolveLogsRoot(env), sessionId);
}

/**
 * Directory for an orphan session (the backend never reported readiness):
 * `<logsRoot>/orphan-<timestamp>`.
 */
export function orphanLogDir(timestamp: number, env?: NodeJS.ProcessEnv): string {
  return path.join(resolveLogsRoot(env), `orphan-${timestamp}`);
}
