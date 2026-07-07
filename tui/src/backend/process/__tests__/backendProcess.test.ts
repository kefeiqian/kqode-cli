import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import type { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BackendErrorKind } from '@contracts/backend/index.ts';
import {
  launchSourceBackend,
  spawnBackend,
  type LaunchedBackend
} from '@backend/process/backendProcess.ts';
import { MESSAGE_SUBMIT_METHOD } from '@contracts/backend/index.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');
const INTEGRATION_TIMEOUT_MS = 180_000;

function frameRequest(payload: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  return Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, 'utf8'), body]);
}

function readResponseFrame(
  stream: Readable
): Promise<{ result: { turnId: string } }> {
  return new Promise((resolve, reject) => {
    let buffer = Buffer.alloc(0);
    const cleanup = () => {
      stream.off('data', onData);
      stream.off('error', reject);
    };
    const onData = (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      for (;;) {
        const headerEnd = buffer.indexOf('\r\n\r\n');
        if (headerEnd === -1) {
          return;
        }
        const header = buffer.subarray(0, headerEnd).toString('utf8');
        const match = /Content-Length: (\d+)/i.exec(header);
        if (match === null) {
          cleanup();
          reject(new Error(`missing content length in frame header: ${header}`));
          return;
        }
        const bodyStart = headerEnd + 4;
        const bodyEnd = bodyStart + Number(match[1]);
        if (buffer.length < bodyEnd) {
          return;
        }
        const frame = JSON.parse(buffer.subarray(bodyStart, bodyEnd).toString('utf8'));
        buffer = buffer.subarray(bodyEnd);
        // Skip the one-shot ready notification the backend emits on startup: a
        // JSON-RPC notification carries no id, a response does.
        if (frame.id !== undefined) {
          cleanup();
          resolve(frame);
          return;
        }
      }
    };
    stream.on('data', onData);
    stream.once('error', reject);
  });
}

async function submitThroughLauncher(
  backend: LaunchedBackend,
  text: string
): Promise<{ turnId: string }> {
  const response = readResponseFrame(backend.stdout);
  backend.stdin.write(
    frameRequest({
      jsonrpc: '2.0',
      id: 1,
      method: MESSAGE_SUBMIT_METHOD,
      params: { text, turnId: 'turn-1' }
    })
  );
  const frame = await response;
  return frame.result;
}

// Best-effort temp cleanup: on Windows a just-killed backend may still hold its
// cwd handle for a moment; the OS reclaims the temp dir regardless.
function safeRemove(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

async function withTempHome<T>(run: () => Promise<T>): Promise<T> {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'kqode-home-'));
  const oldHome = process.env.HOME;
  const oldUserProfile = process.env.USERPROFILE;
  const oldCargoHome = process.env.CARGO_HOME;
  const oldRustupHome = process.env.RUSTUP_HOME;
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  if (oldHome !== undefined) {
    process.env.CARGO_HOME = oldCargoHome ?? path.join(oldHome, '.cargo');
    process.env.RUSTUP_HOME = oldRustupHome ?? path.join(oldHome, '.rustup');
  }
  try {
    return await run();
  } finally {
    restoreEnv('HOME', oldHome);
    restoreEnv('USERPROFILE', oldUserProfile);
    restoreEnv('CARGO_HOME', oldCargoHome);
    restoreEnv('RUSTUP_HOME', oldRustupHome);
    safeRemove(home);
  }
}

function restoreEnv(
  name: 'HOME' | 'USERPROFILE' | 'CARGO_HOME' | 'RUSTUP_HOME',
  value: string | undefined
): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

describe('spawnBackend', () => {
  it('rejects with a launch error when the backend executable is missing', async () => {
    await expect(
      spawnBackend({
        binaryPath: path.join(process.cwd(), 'no-such-kqode-backend-binary'),
        workspaceCwd: process.cwd()
      })
    ).rejects.toMatchObject({ kind: BackendErrorKind.Launch });
  });
});

describe('launchSourceBackend (integration)', () => {
  it(
    'builds and launches the backend and returns a well-formed ack',
    async () => {
      // A temp workspace with no `.env` in its ancestry makes the backend find
      // no CUSTOM_API_KEY; submit still returns an accepted-only ack.
      const workspaceCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'kqode-launch-'));
      await withTempHome(async () => {
        const backend = await launchSourceBackend({ repoRoot, workspaceCwd });
        try {
          const result = await submitThroughLauncher(backend, 'hi from a temp workspace');
          expect(result.turnId).toBe('turn-1');
          expect('status' in result).toBe(false);
        } finally {
          backend.dispose();
          safeRemove(workspaceCwd);
        }
      });
    },
    INTEGRATION_TIMEOUT_MS
  );

  it(
    'launches from a distinct workspace directory and still answers submit',
    async () => {
      const workspaceCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'kqode-launch-alt-'));
      await withTempHome(async () => {
        const backend = await launchSourceBackend({ repoRoot, workspaceCwd });
        try {
          const result = await submitThroughLauncher(backend, 'café ☕');
          expect(result.turnId).toBe('turn-1');
          expect('status' in result).toBe(false);
        } finally {
          backend.dispose();
          safeRemove(workspaceCwd);
        }
      });
    },
    INTEGRATION_TIMEOUT_MS
  );
});
