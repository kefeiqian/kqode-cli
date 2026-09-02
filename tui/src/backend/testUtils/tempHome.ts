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
  // Derive the real home from HOME (Unix) or USERPROFILE (Windows, where HOME is
  // usually unset) so the isolated run still points Cargo/Rustup at the real
  // toolchain config rather than the empty temp home — otherwise a Windows build
  // spawned by these tests fails with "rustup could not choose a version of cargo".
  const realHome = previous.HOME ?? previous.USERPROFILE;
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  if (realHome !== undefined) {
    process.env.CARGO_HOME = previous.CARGO_HOME ?? path.join(realHome, '.cargo');
    process.env.RUSTUP_HOME = previous.RUSTUP_HOME ?? path.join(realHome, '.rustup');
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
