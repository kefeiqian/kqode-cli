import { spawn, type ChildProcess } from 'node:child_process';
import { buildKqodeMeta } from '@/cli/meta.ts';
import { buildHardenedEnv } from '@backend/process/processEnv.ts';
import {
  materializePackagedBackend,
  type EmbeddedBackendAsset
} from '@backend/packaged/materializeBackend.ts';

const PROMPT_FLAG = '--prompt';

export type RustEntrypointOptions = {
  entryUrl: string;
  loadPackagedAsset?: () => EmbeddedBackendAsset;
};

type SpawnOptions = Parameters<typeof spawn>[2];

type RustEntrypointDeps = {
  materialize?: typeof materializePackagedBackend;
  spawnProcess?: (binaryPath: string, args: readonly string[], options: SpawnOptions) => ChildProcess;
};

/** Whether `args` address a Rust-owned CLI path rather than the Ink TUI. */
export function isRustEntrypointArgs(args: readonly string[]): boolean {
  return args.includes(PROMPT_FLAG);
}

/**
 * Runs Rust-owned CLI entrypoints through the embedded backend binary when the
 * packaged TUI executable receives them.
 *
 * Returns `true` when the args were handled. Source-mode TUI runs do not carry
 * an embedded asset, so those fall through to the normal TUI command.
 */
export async function runPackagedRustEntrypoint(
  options: RustEntrypointOptions,
  args: readonly string[] = process.argv.slice(2),
  deps: RustEntrypointDeps = {}
): Promise<boolean> {
  if (options.loadPackagedAsset === undefined || !isRustEntrypointArgs(args)) {
    return false;
  }

  const materialize = deps.materialize ?? materializePackagedBackend;
  const spawnProcess = deps.spawnProcess ?? spawn;
  const version = buildKqodeMeta({ entryUrl: options.entryUrl }).version;
  const binaryPath = await materialize({
    asset: options.loadPackagedAsset(),
    version
  });
  process.exitCode = await runChild(spawnProcess(binaryPath, args, {
    cwd: process.cwd(),
    env: buildHardenedEnv(),
    shell: false,
    stdio: 'inherit',
    windowsHide: true
  }));
  return true;
}

function runChild(child: ChildProcess): Promise<number> {
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => {
      if (code !== null) {
        resolve(code);
        return;
      }
      resolve(signal === null ? 1 : 128 + signalNumber(signal));
    });
  });
}

function signalNumber(signal: NodeJS.Signals): number {
  return signal === 'SIGINT' ? 2 : signal === 'SIGTERM' ? 15 : 1;
}
