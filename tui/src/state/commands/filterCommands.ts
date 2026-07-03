import { COMMAND_REGISTRY } from '@state/commands/registry.ts';
import type { CommandDefinition } from '@state/commands/registry.ts';

/**
 * Commands whose name matches `query` case-insensitively by prefix.
 *
 * The query is trimmed and lower-cased and a single leading `/` is stripped, so
 * `/clear`, `clear`, and `clear ` all match `/clear`. An empty query returns the
 * whole registry in display order.
 */
export function filterCommands(query: string): CommandDefinition[] {
  const normalized = query.trim().toLowerCase().replace(/^\//, '');
  if (normalized.length === 0) {
    return [...COMMAND_REGISTRY];
  }

  return COMMAND_REGISTRY.filter((command) =>
    command.name.slice(1).toLowerCase().startsWith(normalized)
  );
}
