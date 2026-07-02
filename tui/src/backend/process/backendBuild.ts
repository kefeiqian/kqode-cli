import { spawn } from 'node:child_process';
import path from 'node:path';
import { BackendClientError, BackendErrorKind } from '@contracts/backend/index.ts';
import {
  BUILD_STDERR_CAP_BYTES,
  CARGO_BINARY_NAME,
  CARGO_COMMAND,
  DEFAULT_BUILD_TIMEOUT_MS
} from '@constants/backend.ts';
import { buildHardenedEnv } from '@backend/process/processEnv.ts';
import { CappedBuffer, killProcessTree } from '@backend/process/processUtils.ts';

/** Resolves the debug-profile backend binary path with platform-correct naming. */
export function resolveBackendBinaryPath(repoRoot: string, platform = process.platform): string {
  const fileName = platform === 'win32' ? `${CARGO_BINARY_NAME}.exe` : CARGO_BINARY_NAME;
  return path.join(repoRoot, 'target', 'debug', fileName);
}

export type BuildBackendOptions = {
  repoRoot: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  command?: string;
  args?: readonly string[];
};

/**
 * Builds the Rust backend from the trusted `repoRoot` manifest.
 *
 * The build always runs from `repoRoot` with a hardened, Cargo-enabled
 * environment so an untrusted workspace `.cargo/config.toml` or `PATH` entry
 * cannot influence it. The `command`/`args` overrides exist for deterministic
 * tests of the timeout and non-zero-exit paths.
 *
 * # Errors
 *
 * Rejects with a `launch` error when the build cannot start or exits non-zero,
 * and a `timeout` error when it exceeds `timeoutMs`.
 */
export async function buildBackend({
  repoRoot,
  env = buildHardenedEnv({ includeCargo: true }),
  timeoutMs = DEFAULT_BUILD_TIMEOUT_MS,
  command = CARGO_COMMAND,
  args = ['build', '--bin', CARGO_BINARY_NAME]
}: BuildBackendOptions): Promise<void> {
  const build = spawn(command, [...args], {
    cwd: repoRoot,
    env,
    shell: false,
    stdio: ['ignore', 'ignore', 'pipe'],
    windowsHide: true
  });

  const stderr = new CappedBuffer(BUILD_STDERR_CAP_BYTES);
  build.stderr?.on('data', (chunk: Buffer) => stderr.append(chunk));

  return await new Promise<void>((resolve, reject) => {
    let settled = false;
    const settle = (action: () => void): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      action();
    };

    const timer = setTimeout(() => {
      settle(() => {
        killProcessTree(build.pid);
        reject(
          new BackendClientError(
            BackendErrorKind.Timeout,
            `backend build timed out after ${timeoutMs}ms`
          )
        );
      });
    }, timeoutMs);

    build.once('error', (error) => {
      settle(() => {
        reject(
          new BackendClientError(
            BackendErrorKind.Launch,
            `failed to start backend build: ${error.message}`,
            { cause: error }
          )
        );
      });
    });

    build.once('close', (code) => {
      settle(() => {
        if (code === 0) {
          resolve();
          return;
        }
        reject(new BackendClientError(BackendErrorKind.Launch, buildFailureMessage(code, stderr)));
      });
    });
  });
}

function buildFailureMessage(code: number | null, stderr: CappedBuffer): string {
  const detail = stderr.toString().trim();
  const base = `backend build exited with code ${code ?? 'null'}`;
  return detail.length === 0 ? base : `${base}: ${detail}`;
}
