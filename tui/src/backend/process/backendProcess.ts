import { spawn, type ChildProcess } from 'node:child_process';
import type { Readable, Writable } from 'node:stream';
import { BackendClientError, BackendErrorKind } from '@contracts/backend/index.ts';
import { buildBackend, resolveBackendBinaryPath } from '@backend/process/backendBuild.ts';
import { BACKEND_MODE_ARG, BACKEND_STDERR_CAP_BYTES } from '@constants/backend.ts';
import { buildHardenedEnv } from '@backend/process/processEnv.ts';
import { CappedBuffer, killProcessTree } from '@backend/process/processUtils.ts';

/** How a launched backend process ended. */
export type BackendExit = { code: number | null; signal: NodeJS.Signals | null };

/**
 * A running backend process exposed as transport-neutral handles.
 *
 * The JSON-RPC client consumes `stdin`/`stdout`, observes termination through
 * `onExit`, and reclaims the process tree through `dispose`; no display code
 * ever touches the underlying child process.
 */
export type LaunchedBackend = {
  readonly pid: number | undefined;
  readonly stdin: Writable;
  readonly stdout: Readable;
  readonly stderr: Readable;
  stderrText(): string;
  onExit(listener: (exit: BackendExit) => void): void;
  dispose(): void;
};

export type SpawnBackendOptions = {
  binaryPath: string;
  workspaceCwd: string;
  env?: NodeJS.ProcessEnv;
};

/**
 * Spawns an already-built backend binary in `workspaceCwd` over piped stdio.
 *
 * Resolving here means the OS launched the process, not that it can serve
 * JSON-RPC: readiness (and its startup timeout) is enforced by the backend
 * client once the connection is live, so a process that spawns but never speaks
 * is caught there rather than being mistaken for a healthy start.
 *
 * # Errors
 *
 * Rejects with a `launch` error when the executable cannot be spawned or its
 * stdio pipes are unavailable.
 */
export async function spawnBackend({
  binaryPath,
  workspaceCwd,
  env = buildHardenedEnv()
}: SpawnBackendOptions): Promise<LaunchedBackend> {
  const child = spawn(binaryPath, [BACKEND_MODE_ARG], {
    cwd: workspaceCwd,
    env,
    shell: false,
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true
  });

  await waitForSpawn(child);

  const { stdin, stdout, stderr } = child;
  if (stdin === null || stdout === null || stderr === null) {
    killProcessTree(child.pid);
    throw new BackendClientError(BackendErrorKind.Launch, 'backend process is missing stdio pipes');
  }

  const stderrBuffer = new CappedBuffer(BACKEND_STDERR_CAP_BYTES);
  stderr.on('data', (chunk: Buffer) => stderrBuffer.append(chunk));
  let exit: BackendExit | undefined;
  const exitListeners: Array<(exit: BackendExit) => void> = [];
  child.once('close', (code, signal) => {
    exit = { code, signal };
    for (const listener of exitListeners.splice(0)) {
      listener(exit);
    }
  });

  return {
    pid: child.pid,
    stdin,
    stdout,
    stderr,
    stderrText() {
      return stderrBuffer.toString();
    },
    onExit(listener) {
      if (exit !== undefined) {
        listener(exit);
        return;
      }
      exitListeners.push(listener);
    },
    dispose() {
      killProcessTree(child.pid);
    }
  };
}

export type LaunchSourceBackendOptions = {
  repoRoot: string;
  workspaceCwd: string;
  buildTimeoutMs?: number;
};

/**
 * Builds the backend from `repoRoot`, then launches it in `workspaceCwd`.
 *
 * This is the source-mode developer path: the trusted build and the
 * workspace-scoped execution are kept as two guarded steps sharing one
 * hardened environment policy.
 */
export async function launchSourceBackend({
  repoRoot,
  workspaceCwd,
  buildTimeoutMs
}: LaunchSourceBackendOptions): Promise<LaunchedBackend> {
  await buildBackend({ repoRoot, timeoutMs: buildTimeoutMs });
  return await spawnBackend({
    binaryPath: resolveBackendBinaryPath(repoRoot),
    workspaceCwd
  });
}

/**
 * Resolves once the OS reports the child has spawned, or rejects if it could
 * not be launched.
 *
 * Node emits exactly one of `spawn` (launched) or `error` (could not launch)
 * for a freshly spawned child, so no timeout guard is needed here; the backend
 * client bounds JSON-RPC readiness separately.
 */
function waitForSpawn(child: ChildProcess): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const settle = (action: () => void): void => {
      if (settled) {
        return;
      }
      settled = true;
      action();
    };

    child.once('spawn', () => settle(resolve));
    child.once('error', (error) => {
      settle(() => {
        reject(
          new BackendClientError(
            BackendErrorKind.Launch,
            `failed to start backend process: ${error.message}`,
            { cause: error }
          )
        );
      });
    });
  });
}
