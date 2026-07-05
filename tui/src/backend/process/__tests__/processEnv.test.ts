import { describe, expect, it } from 'vitest';
import { buildHardenedEnv } from '@backend/process/processEnv.ts';

const unixSource: NodeJS.ProcessEnv = {
  PATH: '/usr/bin',
  HOME: '/home/dev',
  TMPDIR: '/tmp',
  GITHUB_TOKEN: 'should-be-dropped',
  AWS_SECRET_ACCESS_KEY: 'should-be-dropped',
  CARGO_HOME: '/home/dev/.cargo',
  RANDOM_UNRELATED_VAR: 'should-be-dropped'
};

describe('buildHardenedEnv', () => {
  it('keeps only allowlisted variables and drops secrets and unknowns', () => {
    const env = buildHardenedEnv({ platform: 'linux', source: unixSource });

    expect(env.PATH).toBe('/usr/bin');
    expect(env.HOME).toBe('/home/dev');
    expect(env.TMPDIR).toBe('/tmp');
    expect(env.GITHUB_TOKEN).toBeUndefined();
    expect(env.AWS_SECRET_ACCESS_KEY).toBeUndefined();
    expect(env.RANDOM_UNRELATED_VAR).toBeUndefined();
  });

  it('excludes Cargo variables unless a build needs them', () => {
    expect(buildHardenedEnv({ platform: 'linux', source: unixSource }).CARGO_HOME).toBeUndefined();
    expect(
      buildHardenedEnv({ platform: 'linux', source: unixSource, includeCargo: true }).CARGO_HOME
    ).toBe('/home/dev/.cargo');
  });

  it('preserves required Windows variables while still dropping secrets', () => {
    const env = buildHardenedEnv({
      platform: 'win32',
      source: {
        Path: 'C:\\Windows\\System32',
        PATHEXT: '.COM;.EXE',
        SystemRoot: 'C:\\Windows',
        USERPROFILE: 'C:\\Users\\dev',
        AZURE_CLIENT_SECRET: 'should-be-dropped'
      }
    });

    expect(env.Path).toBe('C:\\Windows\\System32');
    expect(env.PATHEXT).toBe('.COM;.EXE');
    expect(env.SystemRoot).toBe('C:\\Windows');
    expect(env.USERPROFILE).toBe('C:\\Users\\dev');
    expect(env.AZURE_CLIENT_SECRET).toBeUndefined();
  });

  it('passes through non-secret KQode runtime toggles for the backend', () => {
    const env = buildHardenedEnv({
      platform: 'linux',
      source: {
        PATH: '/usr/bin',
        KQODE_DEBUG: '1',
        KQODE_LOG_DIR: '/tmp/kqode-logs',
        GITHUB_TOKEN: 'should-be-dropped'
      }
    });

    expect(env.KQODE_DEBUG).toBe('1');
    expect(env.KQODE_LOG_DIR).toBe('/tmp/kqode-logs');
    expect(env.GITHUB_TOKEN).toBeUndefined();
  });
});
