import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { withTempHome } from '@backend/testUtils/tempHome.ts';

const TRACKED = ['HOME', 'USERPROFILE', 'CARGO_HOME', 'RUSTUP_HOME'] as const;

describe('withTempHome', () => {
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = Object.fromEntries(TRACKED.map((name) => [name, process.env[name]]));
  });

  afterEach(() => {
    for (const name of TRACKED) {
      const value = saved[name];
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  });

  it('isolates HOME/USERPROFILE to a fresh temp dir and restores + cleans up after', async () => {
    process.env.HOME = '/home/dev';
    process.env.USERPROFILE = '/home/dev';

    let seenHome = '';
    await withTempHome(async () => {
      seenHome = process.env.HOME ?? '';
      expect(process.env.HOME).not.toBe('/home/dev');
      expect(fs.existsSync(seenHome)).toBe(true);
    });

    expect(process.env.HOME).toBe('/home/dev');
    expect(fs.existsSync(seenHome)).toBe(false);
  });

  it('preserves the real Cargo/Rustup homes from HOME (Unix)', async () => {
    process.env.HOME = '/home/dev';
    delete process.env.USERPROFILE;
    delete process.env.CARGO_HOME;
    delete process.env.RUSTUP_HOME;

    await withTempHome(async () => {
      expect(process.env.CARGO_HOME).toBe(path.join('/home/dev', '.cargo'));
      expect(process.env.RUSTUP_HOME).toBe(path.join('/home/dev', '.rustup'));
    });
  });

  it('preserves the real Cargo/Rustup homes from USERPROFILE when HOME is unset (Windows)', async () => {
    delete process.env.HOME;
    process.env.USERPROFILE = 'C:\\Users\\dev';
    delete process.env.CARGO_HOME;
    delete process.env.RUSTUP_HOME;

    await withTempHome(async () => {
      expect(process.env.RUSTUP_HOME).toBe(path.join('C:\\Users\\dev', '.rustup'));
      expect(process.env.CARGO_HOME).toBe(path.join('C:\\Users\\dev', '.cargo'));
    });
  });

  it('keeps an explicitly-set RUSTUP_HOME/CARGO_HOME over the derived default', async () => {
    process.env.USERPROFILE = 'C:\\Users\\dev';
    delete process.env.HOME;
    process.env.CARGO_HOME = 'D:\\cargo';
    process.env.RUSTUP_HOME = 'D:\\rustup';

    await withTempHome(async () => {
      expect(process.env.CARGO_HOME).toBe('D:\\cargo');
      expect(process.env.RUSTUP_HOME).toBe('D:\\rustup');
    });
  });
});
