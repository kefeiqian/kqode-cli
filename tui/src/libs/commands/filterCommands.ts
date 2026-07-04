import { COMMAND_REGISTRY } from '@libs/commands/registry.ts';
import type { CommandDefinition } from '@libs/commands/registry.ts';
import { commandMatchKey, normalizeCommandQuery } from '@libs/commands/matchCommand.ts';

/**
 * Commands whose name matches `query` case-insensitively by prefix.
 *
 * The query is normalized (trimmed, lower-cased, leading `/` stripped), so
 * `/clear`, `clear`, and `clear ` all match `/clear`. An empty query returns the
 * whole registry in display order.
 */
export function filterCommands(query: string): CommandDefinition[] {
  const normalized = normalizeCommandQuery(query);
  if (normalized.length === 0) {
    return [...COMMAND_REGISTRY];
  }

  return COMMAND_REGISTRY.filter((command) => commandMatchKey(command).startsWith(normalized));
}
