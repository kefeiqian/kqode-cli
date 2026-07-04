import { COMMAND_REGISTRY } from '@libs/commands/registry.ts';
import type { CommandDefinition } from '@libs/commands/registry.ts';

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
export function exactCommandMatch(text: string): CommandDefinition | undefined {
  const normalized = normalizeCommandQuery(text);
  return COMMAND_REGISTRY.find((command) => commandMatchKey(command) === normalized);
}
