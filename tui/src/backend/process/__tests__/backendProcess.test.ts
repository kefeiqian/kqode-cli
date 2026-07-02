import path from 'node:path';
import type { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BackendErrorKind } from '@contracts/backend/index.ts';
import {
  launchSourceBackend,
  spawnBackend,
  type LaunchedBackend
} from '@backend/process/backendProcess.ts';
import { ACK_MESSAGE, MESSAGE_SUBMIT_METHOD } from '@contracts/backend/index.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');
const INTEGRATION_TIMEOUT_MS = 180_000;

function frameRequest(payload: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  return Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, 'utf8'), body]);
}

function readResponseFrame(
  stream: Readable
): Promise<{ result: { message: string; receivedText: string } }> {
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

async function ackThroughLauncher(backend: LaunchedBackend, text: string): Promise<string> {
  const response = readResponseFrame(backend.stdout);
  backend.stdin.write(frameRequest({ jsonrpc: '2.0', id: 1, method: MESSAGE_SUBMIT_METHOD, params: { text } }));
  const frame = await response;
  expect(frame.result.message).toBe(ACK_MESSAGE);
  return frame.result.receivedText;
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
    'builds and launches the backend when invoked from the repo root workspace',
    async () => {
      const backend = await launchSourceBackend({ repoRoot, workspaceCwd: repoRoot });
      try {
        expect(await ackThroughLauncher(backend, 'hi from repo root')).toBe('hi from repo root');
      } finally {
        backend.dispose();
      }
    },
    INTEGRATION_TIMEOUT_MS
  );

  it(
    'preserves a distinct workspace cwd such as the dummy React fixture path',
    async () => {
      const workspaceCwd = path.join(repoRoot, 'tests', 'fixtures', 'dummy-react-app');
      const backend = await launchSourceBackend({ repoRoot, workspaceCwd });
      try {
        expect(await ackThroughLauncher(backend, 'café ☕')).toBe('café ☕');
      } finally {
        backend.dispose();
      }
    },
    INTEGRATION_TIMEOUT_MS
  );
});
