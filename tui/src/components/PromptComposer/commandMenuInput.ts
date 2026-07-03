import { filterCommands } from '@state/commands/filterCommands.ts';
import type { CommandDefinition } from '@state/commands/registry.ts';

/**
 * The command whose name exactly matches `text` (trimmed, case-insensitive, with
 * an optional leading slash), or undefined. Used to resolve a submitted command
 * when the menu is closed (e.g. after Esc-dismiss); a prefix is not enough here,
 * so `/cl` does not run `/clear` without the menu's explicit highlight.
 */
export function exactCommandMatch(text: string): CommandDefinition | undefined {
  const normalized = text.trim().toLowerCase().replace(/^\//, '');
  return filterCommands(text).find((command) => command.name.slice(1).toLowerCase() === normalized);
}

/** Inline hint shown when a `/`-prefixed submission matches no command. */
export function unknownCommandMessage(text: string): string {
  const token = text.trim().split(/\s+/)[0] ?? text.trim();
  return `Unknown command: ${token}`;
}
