import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import type { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BackendErrorKind } from '@contracts/backend/index.ts';
import {
  launchSourceBackend,
  spawnBackend,
  type LaunchedBackend
} from '@backend/process/backendProcess.ts';
import {
  GIT_STATUS_METHOD,
  MESSAGE_SUBMIT_METHOD,
  SUBMIT_STATUS_NEEDS_CONFIGURATION
} from '@contracts/backend/index.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');
const INTEGRATION_TIMEOUT_MS = 180_000;

function frameRequest(payload: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  return Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, 'utf8'), body]);
}

function readResponseFrame(stream: Readable): Promise<{ result: unknown }> {
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
): Promise<{ status: string }> {
  const response = readResponseFrame(backend.stdout);
  backend.stdin.write(
    frameRequest({
      jsonrpc: '2.0',
      id: 1,
      method: MESSAGE_SUBMIT_METHOD,
      params: { text }
    })
  );
  const frame = await response;
  return frame.result as { status: string };
}

async function gitStatusThroughLauncher(backend: LaunchedBackend): Promise<{ label: string | null }> {
  const response = readResponseFrame(backend.stdout);
  backend.stdin.write(
    frameRequest({
      jsonrpc: '2.0',
      id: 2,
      method: GIT_STATUS_METHOD,
      params: null
    })
  );
  const frame = await response;
  return frame.result as { label: string | null };
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
      // Provider setup lands later, so bootstrap submit deterministically returns
      // needsConfiguration regardless of the workspace.
      const workspaceCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'kqode-launch-'));
      const backend = await launchSourceBackend({ repoRoot, workspaceCwd });
      try {
        const result = await submitThroughLauncher(backend, 'hi from a temp workspace');
        expect(result.status).toBe(SUBMIT_STATUS_NEEDS_CONFIGURATION);
      } finally {
        backend.dispose();
        safeRemove(workspaceCwd);
      }
    },
    INTEGRATION_TIMEOUT_MS
  );

  it(
    'uses the distinct workspace directory for git status and submit',
    async () => {
      const workspaceCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'kqode-launch-alt-'));
      execFileSync('git', ['init', '--quiet', '--initial-branch=workspace-branch'], {
        cwd: workspaceCwd
      });
      const backend = await launchSourceBackend({ repoRoot, workspaceCwd });
      try {
        const status = await gitStatusThroughLauncher(backend);
        expect(status.label).toBe('⎇ workspace-branch');

        const result = await submitThroughLauncher(backend, 'café ☕');
        expect(result.status).toBe(SUBMIT_STATUS_NEEDS_CONFIGURATION);
      } finally {
        backend.dispose();
        safeRemove(workspaceCwd);
      }
    },
    INTEGRATION_TIMEOUT_MS
  );
});
