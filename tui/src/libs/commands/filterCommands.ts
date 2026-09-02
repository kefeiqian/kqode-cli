import { COMMAND_REGISTRY } from '@libs/commands/registry.ts';
import type { CommandDefinition } from '@libs/commands/registry.ts';
import { commandMatchKey, normalizeCommandQuery } from '@libs/commands/matchCommand.ts';
import { commandSubcommands, type MenuEntry } from '@libs/commands/subcommands.ts';

/**
 * Commands whose name matches `query` case-insensitively by prefix.
 *
 * The query is normalized (trimmed, lower-cased, leading `/` stripped), so
 * `/clear`, `clear`, and `clear ` all match `/clear`. An empty query returns the
 * whole registry in display order.
 */
export function filterCommands(query: string): MenuEntry[] {
  const normalized = normalizeCommandQuery(query);
  if (normalized.length === 0) {
    return COMMAND_REGISTRY.map((command) => ({ kind: 'command', command }));
  }

  const subcommandEntries = filterSubcommands(normalized);
  if (subcommandEntries !== undefined) {
    return subcommandEntries;
  }

  return COMMAND_REGISTRY.filter((command) => commandMatchKey(command).startsWith(normalized)).map(
    (command) => ({ kind: 'command', command })
  );
}

function filterSubcommands(normalized: string): MenuEntry[] | undefined {
  const collapsed = normalized.replace(/\s+/g, ' ');
  const [parentName, subprefix] = splitParentAndSubprefix(collapsed);
  const parent = COMMAND_REGISTRY.find((command) => commandMatchKey(command) === parentName);
  if (parent === undefined || commandSubcommands(parent).length === 0) {
    return undefined;
  }

  const subcommands = commandSubcommands(parent);
  if (subprefix === undefined) {
    return [
      { kind: 'command', command: parent },
      ...subcommands.map((subcommand) => ({ kind: 'subcommand' as const, parent, subcommand }))
    ];
  }

  if (subprefix.length === 0) {
    return subcommands.map((subcommand) => ({ kind: 'subcommand', parent, subcommand }));
  }

  return subcommands
    .filter((subcommand) => subcommand.name.toLowerCase().startsWith(subprefix))
    .map((subcommand) => ({ kind: 'subcommand', parent, subcommand }));
}

function splitParentAndSubprefix(normalized: string): [string, string | undefined] {
  const spaceIndex = normalized.indexOf(' ');
  if (spaceIndex === -1) {
    return [normalized, undefined];
  }

  return [normalized.slice(0, spaceIndex), normalized.slice(spaceIndex + 1)];
}
