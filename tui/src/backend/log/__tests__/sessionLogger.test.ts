import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createSessionLogger } from '@backend/log/sessionLogger.ts';
import { TUI_LOG_FILENAME } from '@backend/log/logPaths.ts';
import { KQODE_LOG_DIR_ENV_VAR } from '@constants/backend.ts';

const created: string[] = [];

function tmpRoot(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), 'kqode-tui-log-'));
  created.push(root);
  return root;
}

function env(root: string): NodeJS.ProcessEnv {
  return { [KQODE_LOG_DIR_ENV_VAR]: root };
}

function events(file: string): unknown[] {
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => (JSON.parse(line) as { event: unknown }).event);
}

afterEach(() => {
  for (const root of created.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('createSessionLogger', () => {
  it('flushes buffered events in order, then appends live events (AE1)', () => {
    const root = tmpRoot();
    const logger = createSessionLogger({ enabled: true, env: env(root), now: () => 100 });
    logger.log({ event: 'spawn' });
    logger.log({ event: 'build' });
    logger.openSession('sess-1');
    logger.log({ event: 'ready' });

    const file = path.join(root, 'sess-1', TUI_LOG_FILENAME);
    expect(events(file)).toEqual(['spawn', 'build', 'ready']);
  });

  it('writes buffered events to an orphan directory (AE2)', () => {
    const root = tmpRoot();
    const logger = createSessionLogger({ enabled: true, env: env(root), now: () => 42 });
    logger.log({ event: 'spawn' });
    logger.openOrphan();

    const file = path.join(root, 'orphan-42', TUI_LOG_FILENAME);
    expect(events(file)).toEqual(['spawn']);
  });

  it('creates no files when disabled (AE4)', () => {
    const root = tmpRoot();
    const logger = createSessionLogger({ enabled: false, env: env(root) });
    logger.log({ event: 'spawn' });
    logger.openSession('sess-1');

    expect(existsSync(path.join(root, 'sess-1'))).toBe(false);
    expect(readdirSync(root)).toHaveLength(0);
  });

  it('switches to a new session directory on respawn (AE3)', () => {
    const root = tmpRoot();
    const logger = createSessionLogger({ enabled: true, env: env(root), now: () => 1 });
    logger.openSession('sess-1');
    logger.log({ event: 'first' });
    logger.openSession('sess-2');
    logger.log({ event: 'second' });

    expect(events(path.join(root, 'sess-1', TUI_LOG_FILENAME))).toEqual(['first']);
    expect(events(path.join(root, 'sess-2', TUI_LOG_FILENAME))).toEqual(['second']);
  });
});
