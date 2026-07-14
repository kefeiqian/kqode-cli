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
  it('uses a non-shell opener (explorer.exe) on Windows so the url cannot inject', () => {
    expect(resolveOpenCommand(url, 'win32')).toEqual({ command: 'explorer.exe', args: [url] });
  });

  it('passes query-string metacharacters through literally (no shell to reparse them)', () => {
    const query = 'https://example.com/?a=1&b=2';
    expect(resolveOpenCommand(query, 'win32')).toEqual({ command: 'explorer.exe', args: [query] });
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
  function fakeSpawner() {
    const on = vi.fn();
    const unref = vi.fn();
    const spawnProcess = vi.fn(
      (_command: string, _args: string[], _options: { stdio: 'ignore'; detached: true }) => ({
        on,
        unref
      })
    );
    return { on, unref, spawnProcess };
  }

  it('spawns the resolved opener detached and unref’d, reporting success', () => {
    const { unref, spawnProcess } = fakeSpawner();

    expect(openExternalUrl(url, 'linux', spawnProcess)).toBe(true);
    expect(spawnProcess).toHaveBeenCalledWith('xdg-open', [url], {
      stdio: 'ignore',
      detached: true
    });
    expect(unref).toHaveBeenCalledOnce();
  });

  it('attaches an error listener that swallows an async spawn failure', () => {
    const { on, spawnProcess } = fakeSpawner();

    openExternalUrl(url, 'linux', spawnProcess);

    const [event, listener] = on.mock.calls[0] ?? [];
    expect(event).toBe('error');
    // A missing opener (e.g. no xdg-open) emits 'error' asynchronously; the
    // listener must not rethrow, or it would crash the input loop.
    expect(() => (listener as (error: Error) => void)(new Error('ENOENT'))).not.toThrow();
  });

  it('does not spawn for a non-openable url', () => {
    const { spawnProcess } = fakeSpawner();

    expect(openExternalUrl('file:///x', 'linux', spawnProcess)).toBe(false);
    expect(spawnProcess).not.toHaveBeenCalled();
  });

  it('returns false instead of throwing when the spawn fails synchronously', () => {
    const spawnProcess = vi.fn(
      (_command: string, _args: string[], _options: { stdio: 'ignore'; detached: true }) => {
        throw new Error('spawn failed');
      }
    );

    expect(openExternalUrl(url, 'linux', spawnProcess)).toBe(false);
  });
});
