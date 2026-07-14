import { describe, expect, it, vi } from 'vitest';
import {
  isOpenableUrl,
  openExternalUrl,
  resolveOpenCommand
} from '@libs/os/openExternalUrl.ts';

const url = 'https://github.com/o/r/pull/3';

describe('isOpenableUrl', () => {
  it('accepts http and https urls', () => {
    expect(isOpenableUrl(url)).toBe(true);
    expect(isOpenableUrl('http://example.com')).toBe(true);
  });

  it('rejects non-http(s) schemes and malformed urls', () => {
    expect(isOpenableUrl('file:///etc/passwd')).toBe(false);
    expect(isOpenableUrl('javascript:alert(1)')).toBe(false);
    expect(isOpenableUrl('not a url')).toBe(false);
    expect(isOpenableUrl('')).toBe(false);
  });
});

describe('resolveOpenCommand', () => {
  it('uses cmd start with an empty title on Windows, url as its own arg', () => {
    expect(resolveOpenCommand(url, 'win32')).toEqual({
      command: 'cmd',
      args: ['/c', 'start', '', url]
    });
  });

  it('uses open on macOS', () => {
    expect(resolveOpenCommand(url, 'darwin')).toEqual({ command: 'open', args: [url] });
  });

  it('uses xdg-open on Linux', () => {
    expect(resolveOpenCommand(url, 'linux')).toEqual({ command: 'xdg-open', args: [url] });
  });

  it('returns null for a non-openable url so no process is launched', () => {
    expect(resolveOpenCommand('file:///x', 'linux')).toBeNull();
  });
});

describe('openExternalUrl', () => {
  it('spawns the resolved opener detached and unref’d, reporting success', () => {
    const unref = vi.fn();
    const spawnProcess = vi.fn(
      (_command: string, _args: string[], _options: { stdio: 'ignore'; detached: true }) => ({
        unref
      })
    );

    expect(openExternalUrl(url, 'linux', spawnProcess)).toBe(true);
    expect(spawnProcess).toHaveBeenCalledWith('xdg-open', [url], {
      stdio: 'ignore',
      detached: true
    });
    expect(unref).toHaveBeenCalledOnce();
  });

  it('does not spawn for a non-openable url', () => {
    const spawnProcess = vi.fn(
      (_command: string, _args: string[], _options: { stdio: 'ignore'; detached: true }) => ({
        unref: vi.fn()
      })
    );

    expect(openExternalUrl('file:///x', 'linux', spawnProcess)).toBe(false);
    expect(spawnProcess).not.toHaveBeenCalled();
  });

  it('returns false instead of throwing when the spawn fails', () => {
    const spawnProcess = vi.fn(
      (_command: string, _args: string[], _options: { stdio: 'ignore'; detached: true }) => {
        throw new Error('spawn failed');
      }
    );

    expect(openExternalUrl(url, 'linux', spawnProcess)).toBe(false);
  });
});
