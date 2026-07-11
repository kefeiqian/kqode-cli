import { execFile } from 'node:child_process';
import type { ClipboardClient } from '@contracts/clipboard/index.ts';

export const CLIPBOARD_TIMEOUT_MS = 2_000;
export const PBCOPY_COMMAND = 'pbcopy';
export const PBPASTE_COMMAND = 'pbpaste';
export const POWERSHELL_COMMAND = 'powershell';
export const WL_COPY_COMMAND = 'wl-copy';
export const WL_PASTE_COMMAND = 'wl-paste';
export const XCLIP_COMMAND = 'xclip';
export const XSEL_COMMAND = 'xsel';

const POWERSHELL_NO_PROFILE_ARG = '-NoProfile';
const POWERSHELL_COMMAND_ARG = '-Command';
// Windows PowerShell decodes piped stdin and encodes stdout with the OEM console
// code page (e.g. GBK on zh-CN), while Node reads/writes these pipes as UTF-8, so
// non-ASCII (CJK, emoji, box-drawing) corrupts on both copy and paste. Setting
// `[Console]::InputEncoding`/`OutputEncoding` inside the `-Command` is too late:
// `$input` and the redirected stdout handle are already bound before the script
// runs. Instead move the bytes explicitly — read raw stdin and decode UTF-8 on
// write, encode UTF-8 to raw stdout on read. Validated round-tripping CJK,
// box-drawing, emoji, and accented text on a GBK console.
const POWERSHELL_READ_SCRIPT =
  '$t=Get-Clipboard -Raw; if($null -ne $t){$b=[System.Text.Encoding]::UTF8.GetBytes($t);$o=[Console]::OpenStandardOutput();$o.Write($b,0,$b.Length);$o.Flush()}';
const POWERSHELL_WRITE_SCRIPT =
  '$in=[Console]::OpenStandardInput();$ms=[System.IO.MemoryStream]::new();$in.CopyTo($ms);Set-Clipboard -Value ([System.Text.Encoding]::UTF8.GetString($ms.ToArray()))';
const XCLIP_SELECTION_ARGS = ['-selection', 'clipboard'] as const;
const XCLIP_READ_ARGS = ['-selection', 'clipboard', '-o'] as const;
const XSEL_WRITE_ARGS = ['-ib'] as const;
const XSEL_READ_ARGS = ['-ob'] as const;
const XSEL_TOOL_VALUE = 'xsel';

export type ClipboardCommand = {
  command: string;
  args: readonly string[];
};

export type ClipboardCommandSet = {
  read: ClipboardCommand;
  write: ClipboardCommand;
};

/**
 * Resolves fixed clipboard commands for a platform and environment.
 *
 * The returned write command never contains clipboard content; callers must
 * pass payloads on stdin.
 */
export function resolveClipboardCommand(
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv = process.env
): ClipboardCommandSet | undefined {
  if (platform === 'darwin') {
    return {
      read: { command: PBPASTE_COMMAND, args: [] },
      write: { command: PBCOPY_COMMAND, args: [] }
    };
  }

  if (platform === 'win32') {
    const args = [POWERSHELL_NO_PROFILE_ARG, POWERSHELL_COMMAND_ARG] as const;
    return {
      read: { command: POWERSHELL_COMMAND, args: [...args, POWERSHELL_READ_SCRIPT] },
      write: { command: POWERSHELL_COMMAND, args: [...args, POWERSHELL_WRITE_SCRIPT] }
    };
  }

  if (platform !== 'linux') {
    return undefined;
  }

  if (env.WAYLAND_DISPLAY) {
    return {
      read: { command: WL_PASTE_COMMAND, args: [] },
      write: { command: WL_COPY_COMMAND, args: [] }
    };
  }

  if (!env.DISPLAY) {
    return undefined;
  }

  if (env.KQODE_X11_CLIPBOARD_TOOL === XSEL_TOOL_VALUE) {
    return {
      read: { command: XSEL_COMMAND, args: XSEL_READ_ARGS },
      write: { command: XSEL_COMMAND, args: XSEL_WRITE_ARGS }
    };
  }

  return {
    read: { command: XCLIP_COMMAND, args: XCLIP_READ_ARGS },
    write: { command: XCLIP_COMMAND, args: XCLIP_SELECTION_ARGS }
  };
}

/** System clipboard client backed by platform clipboard commands. */
export const systemClipboard: ClipboardClient = {
  readText: async () => {
    const command = resolveClipboardCommand(process.platform)?.read;
    if (command === undefined) {
      return null;
    }

    try {
      return await runClipboardCommand(command, undefined);
    } catch {
      return null;
    }
  },

  writeText: async (text: string) => {
    const command = resolveClipboardCommand(process.platform)?.write;
    if (command === undefined) {
      return false;
    }

    try {
      await runClipboardCommand(command, text);
      return true;
    } catch {
      return false;
    }
  }
};

function runClipboardCommand(command: ClipboardCommand, input: string | undefined): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      command.command,
      [...command.args],
      { encoding: 'utf8', timeout: CLIPBOARD_TIMEOUT_MS },
      (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(stdout);
      }
    );

    if (input !== undefined) {
      child.stdin?.end(input);
    }
  });
}
