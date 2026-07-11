import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CLIPBOARD_TIMEOUT_MS,
  PBCOPY_COMMAND,
  PBPASTE_COMMAND,
  POWERSHELL_COMMAND,
  WL_COPY_COMMAND,
  WL_PASTE_COMMAND,
  XCLIP_COMMAND,
  XSEL_COMMAND,
  resolveClipboardCommand,
  systemClipboard
} from '@libs/clipboard/systemClipboard.ts';

const execFileMock = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', () => ({
  execFile: execFileMock
}));

describe('resolveClipboardCommand', () => {
  it('returns pbpaste and pbcopy on macOS', () => {
    expect(resolveClipboardCommand('darwin')).toEqual({
      read: { command: PBPASTE_COMMAND, args: [] },
      write: { command: PBCOPY_COMMAND, args: [] }
    });
  });

  it('returns PowerShell Get-Clipboard and Set-Clipboard on Windows', () => {
    expect(resolveClipboardCommand('win32')).toEqual({
      read: {
        command: POWERSHELL_COMMAND,
        args: [
          '-NoProfile',
          '-Command',
          '$t=Get-Clipboard -Raw; if($null -ne $t){$b=[System.Text.Encoding]::UTF8.GetBytes($t);$o=[Console]::OpenStandardOutput();$o.Write($b,0,$b.Length);$o.Flush()}'
        ]
      },
      write: {
        command: POWERSHELL_COMMAND,
        args: [
          '-NoProfile',
          '-Command',
          '$in=[Console]::OpenStandardInput();$ms=[System.IO.MemoryStream]::new();$in.CopyTo($ms);Set-Clipboard -Value ([System.Text.Encoding]::UTF8.GetString($ms.ToArray()))'
        ]
      }
    });
  });

  it('moves clipboard bytes as explicit UTF-8 on Windows in both directions', () => {
    const commands = resolveClipboardCommand('win32');
    const read = commands?.read.args.at(-1) ?? '';
    const write = commands?.write.args.at(-1) ?? '';
    // Read: clipboard text -> UTF-8 bytes -> raw stdout (bypasses OEM console encoding).
    expect(read).toContain('Get-Clipboard -Raw');
    expect(read).toContain('[System.Text.Encoding]::UTF8.GetBytes');
    expect(read).toContain('OpenStandardOutput');
    // Write: raw stdin bytes -> UTF-8 decode -> Set-Clipboard.
    expect(write).toContain('OpenStandardInput');
    expect(write).toContain('[System.Text.Encoding]::UTF8.GetString');
    expect(write).toContain('Set-Clipboard');
  });

  it('returns wl-paste and wl-copy when Wayland is present', () => {
    expect(resolveClipboardCommand('linux', { WAYLAND_DISPLAY: 'wayland-0' })).toEqual({
      read: { command: WL_PASTE_COMMAND, args: [] },
      write: { command: WL_COPY_COMMAND, args: [] }
    });
  });

  it('returns xclip by default for X11', () => {
    expect(resolveClipboardCommand('linux', { DISPLAY: ':0' })).toEqual({
      read: { command: XCLIP_COMMAND, args: ['-selection', 'clipboard', '-o'] },
      write: { command: XCLIP_COMMAND, args: ['-selection', 'clipboard'] }
    });
  });

  it('returns xsel when selected for X11', () => {
    expect(
      resolveClipboardCommand('linux', { DISPLAY: ':0', KQODE_X11_CLIPBOARD_TOOL: 'xsel' })
    ).toEqual({
      read: { command: XSEL_COMMAND, args: ['-ob'] },
      write: { command: XSEL_COMMAND, args: ['-ib'] }
    });
  });

  it('returns undefined for unsupported platforms or Linux without a display', () => {
    expect(resolveClipboardCommand('aix')).toBeUndefined();
    expect(resolveClipboardCommand('linux', {})).toBeUndefined();
  });

  it('keeps write argv fixed and free of clipboard payload content', () => {
    const payload = 'hello; $(bad)\n`more`';

    for (const platform of ['darwin', 'win32'] as const) {
      const command = resolveClipboardCommand(platform)?.write;
      expect(command).toBeDefined();
      expect([command?.command, ...(command?.args ?? [])].join(' ')).not.toContain(payload);
    }
  });
});

describe('systemClipboard', () => {
  beforeEach(() => {
    execFileMock.mockReset();
    Object.defineProperty(process, 'platform', { value: 'darwin' });
  });

  it('returns null and false when no command is available', async () => {
    Object.defineProperty(process, 'platform', { value: 'aix' });

    await expect(systemClipboard.readText()).resolves.toBeNull();
    await expect(systemClipboard.writeText('value')).resolves.toBe(false);
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it('returns an available-but-empty clipboard as an empty string', async () => {
    execFileMock.mockImplementation((_command, _args, _options, callback) => {
      complete(callback, null, '');
      return childProcess();
    });

    await expect(systemClipboard.readText()).resolves.toBe('');
    expect(execFileMock.mock.calls[0][2]).toMatchObject({ timeout: CLIPBOARD_TIMEOUT_MS });
  });

  it('returns null or false when the command fails', async () => {
    execFileMock.mockImplementation((_command, _args, _options, callback) => {
      complete(callback, new Error('failed'), '');
      return childProcess();
    });

    await expect(systemClipboard.readText()).resolves.toBeNull();
    await expect(systemClipboard.writeText('value')).resolves.toBe(false);
  });

  it('writes clipboard content only to stdin', async () => {
    const stdinEnd = vi.fn();
    execFileMock.mockImplementation((_command, _args, _options, callback) => {
      complete(callback, null, '');
      return childProcess(stdinEnd);
    });

    const payload = 'hello; $(bad)\n`more`';
    await expect(systemClipboard.writeText(payload)).resolves.toBe(true);

    expect(stdinEnd).toHaveBeenCalledWith(payload);
    const [, args] = execFileMock.mock.calls[0];
    expect(args).toEqual([]);
  });
});

function childProcess(stdinEnd = vi.fn()) {
  return { stdin: { end: stdinEnd } };
}

function complete(callback: unknown, error: Error | null, stdout: string) {
  (callback as (error: Error | null, stdout: string, stderr: string) => void)(error, stdout, '');
}
