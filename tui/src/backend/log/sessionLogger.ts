import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

import { loggingEnabled } from '@backend/log/logGating.ts';
import { orphanLogDir, sessionLogDir, TUI_LOG_FILENAME } from '@backend/log/logPaths.ts';

/** One structured line in `tui.jsonl`: `event` names the kind, extra fields are free-form. */
export type LogEvent = { event: string; [key: string]: unknown };

/** File-only, buffer-then-flush JSONL logger for the TUI's view of a session. */
export type SessionLogger = {
  /** Records an event: buffered until a file is open, then appended in order. */
  log(event: LogEvent): void;
  /** Opens `<logsRoot>/<sessionId>/tui.jsonl`, flushing buffered events into it. */
  openSession(sessionId: string): void;
  /** Opens `<logsRoot>/orphan-<ts>/tui.jsonl` when the backend never readied. */
  openOrphan(): void;
  /** Releases the logger (synchronous appends are already durable). */
  close(): void;
};

/** Composition inputs for {@link createSessionLogger}. */
export type SessionLoggerOptions = {
  /** Overrides the gate (defaults to {@link loggingEnabled}); used by tests. */
  enabled?: boolean;
  /** Clock for the `ts` field and orphan directory name; used by tests. */
  now?: () => number;
  /** Environment for path resolution; used by tests. */
  env?: NodeJS.ProcessEnv;
};

/**
 * Creates a file-only JSONL session logger.
 *
 * Before a session is opened, `log()` appends to an in-memory buffer;
 * `openSession`/`openOrphan` create the target file, flush the buffer in order,
 * and switch to append mode. A later `openSession` (respawn) switches to the new
 * session directory, starting a fresh `tui.jsonl`. When disabled, every method
 * is a no-op that opens no files. Writes go only to the file — never
 * stdout/stderr (the TUI owns stdout for Ink) — and a failed write is swallowed
 * so debug logging can never crash the app.
 */
export function createSessionLogger(options: SessionLoggerOptions = {}): SessionLogger {
  const enabled = options.enabled ?? loggingEnabled(options.env);
  if (!enabled) {
    return { log() {}, openSession() {}, openOrphan() {}, close() {} };
  }

  const now = options.now ?? Date.now;
  let buffer: string[] = [];
  let filePath: string | undefined;

  const append = (target: string, line: string): void => {
    try {
      appendFileSync(target, line);
    } catch {
      // File-only and best-effort: a failed debug write must never crash the TUI.
    }
  };

  const open = (dir: string): void => {
    try {
      mkdirSync(dir, { recursive: true });
    } catch {
      return; // keep buffering; a later open may succeed
    }
    const target = path.join(dir, TUI_LOG_FILENAME);
    filePath = target;
    const pending = buffer;
    buffer = [];
    for (const line of pending) {
      append(target, line);
    }
  };

  return {
    log(event) {
      const line = `${JSON.stringify({ ts: now(), ...event })}\n`;
      if (filePath === undefined) {
        buffer.push(line);
        return;
      }
      append(filePath, line);
    },
    openSession(sessionId) {
      open(sessionLogDir(sessionId, options.env));
    },
    openOrphan() {
      open(orphanLogDir(now(), options.env));
    },
    close() {
      // Synchronous appends are already durable; nothing buffered to flush.
    }
  };
}
