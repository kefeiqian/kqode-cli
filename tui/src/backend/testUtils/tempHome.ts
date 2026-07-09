import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

type EnvName = 'HOME' | 'USERPROFILE' | 'CARGO_HOME' | 'RUSTUP_HOME' | 'KQODE_DEBUG';

type TempHomeOptions = {
  env?: Partial<Record<EnvName, string>>;
};

/** Runs `run` with an isolated KQode home while preserving Cargo/Rustup homes. */
export async function withTempHome<T>(
  run: () => Promise<T>,
  { env = {} }: TempHomeOptions = {}
): Promise<T> {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'kqode-home-'));
  const previous = snapshotEnv([
    'HOME',
    'USERPROFILE',
    'CARGO_HOME',
    'RUSTUP_HOME',
    ...(Object.keys(env) as EnvName[])
  ]);
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  if (previous.HOME !== undefined) {
    process.env.CARGO_HOME = previous.CARGO_HOME ?? path.join(previous.HOME, '.cargo');
    process.env.RUSTUP_HOME = previous.RUSTUP_HOME ?? path.join(previous.HOME, '.rustup');
  }
  for (const [name, value] of Object.entries(env)) {
    process.env[name as EnvName] = value;
  }
  try {
    return await run();
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      restoreEnv(name as EnvName, value);
    }
    safeRemove(home);
  }
}

function snapshotEnv(names: readonly EnvName[]): Record<EnvName, string | undefined> {
  return Object.fromEntries(names.map((name) => [name, process.env[name]])) as Record<EnvName, string | undefined>;
}

function restoreEnv(name: EnvName, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

function safeRemove(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* temp cleanup is best-effort */
  }
}
