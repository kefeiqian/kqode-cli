import { COMMAND_REGISTRY } from '@libs/commands/registry.ts';
import type { CommandDefinition } from '@libs/commands/registry.ts';
import { commandSubcommands, type MenuEntry } from '@libs/commands/subcommands.ts';

/**
 * Normalizes a raw slash query to its comparable form: trimmed, lower-cased, and
 * with a single leading `/` removed, so `/Clear`, `clear`, and ` clear ` all
 * normalize to `clear`. Shared by every command matcher so the menu, filtering,
 * and submit resolution stay consistent.
 */
export function normalizeCommandQuery(text: string): string {
  return text.trim().toLowerCase().replace(/^\//, '');
}

/** The comparable form of a command's `/name` (lower-cased, without the `/`). */
export function commandMatchKey(command: CommandDefinition): string {
  return command.name.slice(1).toLowerCase();
}

/**
 * The registry command whose name exactly matches `text` (case-insensitive, with
 * an optional leading slash), or undefined. A prefix is intentionally not enough:
 * this resolves a submitted command when the menu is closed (e.g. after an Esc
 * dismiss), so `/cl` does not run `/clear` without the menu's explicit highlight.
 */
export function exactCommandMatch(text: string): MenuEntry | undefined {
  const normalized = normalizeCommandQuery(text).replace(/\s+/g, ' ');
  for (const command of COMMAND_REGISTRY) {
    if (commandMatchKey(command) === normalized) {
      return { kind: 'command', command };
    }

    const subcommands = commandSubcommands(command);
    const prefix = `${commandMatchKey(command)} `;
    if (subcommands.length > 0 && normalized.startsWith(prefix)) {
      const subcommandName = normalized.slice(prefix.length);
      const subcommand = subcommands.find((entry) => entry.name.toLowerCase() === subcommandName);
      if (subcommand !== undefined) {
        return { kind: 'subcommand', parent: command, subcommand };
      }
    }
  }

  return undefined;
}
