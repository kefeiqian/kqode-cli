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
  it('uses the native macOS clipboard commands', () => {
    expect(resolveClipboardCommand('darwin')).toEqual({
      read: { command: PBPASTE_COMMAND, args: [] },
      write: { command: PBCOPY_COMMAND, args: [] }
    });
  });

  it('moves Windows clipboard bytes as explicit UTF-8', () => {
    const commands = resolveClipboardCommand('win32');
    const read = commands?.read.args.at(-1) ?? '';
    const write = commands?.write.args.at(-1) ?? '';

    expect(commands?.read.command).toBe(POWERSHELL_COMMAND);
    expect(commands?.write.command).toBe(POWERSHELL_COMMAND);
    expect(read).toContain('Get-Clipboard -Raw');
    expect(read).toContain('[System.Text.Encoding]::UTF8.GetBytes');
    expect(read).toContain('OpenStandardOutput');
    expect(write).toContain('OpenStandardInput');
    expect(write).toContain('[System.Text.Encoding]::UTF8.GetString');
    expect(write).toContain('Set-Clipboard');
  });

  it('avoids the synthetic newline from wl-paste', () => {
    expect(resolveClipboardCommand('linux', { WAYLAND_DISPLAY: 'wayland-0' })).toEqual({
      read: { command: WL_PASTE_COMMAND, args: ['--no-newline'] },
      write: { command: WL_COPY_COMMAND, args: [] }
    });
  });

  it('uses xclip by default and xsel when configured for X11', () => {
    expect(resolveClipboardCommand('linux', { DISPLAY: ':0' })).toEqual({
      read: { command: XCLIP_COMMAND, args: ['-selection', 'clipboard', '-o'] },
      write: { command: XCLIP_COMMAND, args: ['-selection', 'clipboard'] }
    });
    expect(
      resolveClipboardCommand('linux', {
        DISPLAY: ':0',
        KQODE_X11_CLIPBOARD_TOOL: 'xsel'
      })
    ).toEqual({
      read: { command: XSEL_COMMAND, args: ['-ob'] },
      write: { command: XSEL_COMMAND, args: ['-ib'] }
    });
  });

  it('returns no command for unsupported or displayless platforms', () => {
    expect(resolveClipboardCommand('aix')).toBeUndefined();
    expect(resolveClipboardCommand('linux', {})).toBeUndefined();
  });

  it('keeps clipboard payloads out of command arguments', () => {
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

  it('reports unavailable clipboard commands', async () => {
    Object.defineProperty(process, 'platform', { value: 'aix' });

    await expect(systemClipboard.readText()).resolves.toBeNull();
    await expect(systemClipboard.writeText('value')).resolves.toBe(false);
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it('preserves an available but empty clipboard', async () => {
    execFileMock.mockImplementation((_command, _args, _options, callback) => {
      complete(callback, null, '');
      return childProcess();
    });

    await expect(systemClipboard.readText()).resolves.toBe('');
    expect(execFileMock.mock.calls[0]?.[2]).toMatchObject({
      timeout: CLIPBOARD_TIMEOUT_MS
    });
  });

  it('reports command failures without throwing', async () => {
    execFileMock.mockImplementation((_command, _args, _options, callback) => {
      complete(callback, new Error('failed'), '');
      return childProcess();
    });

    await expect(systemClipboard.readText()).resolves.toBeNull();
    await expect(systemClipboard.writeText('value')).resolves.toBe(false);
  });

  it('writes clipboard content only through stdin', async () => {
    const stdinEnd = vi.fn();
    execFileMock.mockImplementation((_command, _args, _options, callback) => {
      complete(callback, null, '');
      return childProcess(stdinEnd);
    });

    const payload = 'hello; $(bad)\n`more`';
    await expect(systemClipboard.writeText(payload)).resolves.toBe(true);

    expect(stdinEnd).toHaveBeenCalledWith(payload);
    expect(execFileMock.mock.calls[0]?.[1]).toEqual([]);
  });

  it('hides clipboard children so they cannot replace the terminal title', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    execFileMock.mockImplementation((_command, _args, _options, callback) => {
      complete(callback, null, '');
      return childProcess();
    });

    await systemClipboard.readText();
    await systemClipboard.writeText('value');

    for (const call of execFileMock.mock.calls) {
      expect(call[2]).toMatchObject({ windowsHide: true });
    }
  });
});

function childProcess(stdinEnd = vi.fn()) {
  return { stdin: { end: stdinEnd } };
}

function complete(callback: unknown, error: Error | null, stdout: string) {
  (callback as (error: Error | null, stdout: string, stderr: string) => void)(
    error,
    stdout,
    ''
  );
}
