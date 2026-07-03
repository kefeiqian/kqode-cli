import { describe, expect, it } from 'vitest';
import { filterCommands } from '@state/commands/filterCommands.ts';
import { COMMAND_REGISTRY, CommandId } from '@state/commands/registry.ts';

describe('filterCommands', () => {
  it('returns all commands in registry order for an empty query', () => {
    expect(filterCommands('').map((command) => command.id)).toEqual([
      CommandId.Help,
      CommandId.Clear,
      CommandId.Exit
    ]);
  });

  it('prefix-matches command names', () => {
    expect(filterCommands('cl').map((command) => command.id)).toEqual([CommandId.Clear]);
  });

  it('is case-insensitive', () => {
    expect(filterCommands('CL').map((command) => command.id)).toEqual([CommandId.Clear]);
  });

  it('trims trailing whitespace and a leading slash', () => {
    expect(filterCommands('clear ').map((command) => command.id)).toEqual([CommandId.Clear]);
    expect(filterCommands('/clear').map((command) => command.id)).toEqual([CommandId.Clear]);
  });

  it('returns no matches for an unknown query', () => {
    expect(filterCommands('zzz')).toEqual([]);
  });
});

describe('COMMAND_REGISTRY', () => {
  it('contains exactly help, clear, and exit with non-empty descriptions', () => {
    expect(COMMAND_REGISTRY.map((command) => command.id)).toEqual([
      CommandId.Help,
      CommandId.Clear,
      CommandId.Exit
    ]);

    for (const command of COMMAND_REGISTRY) {
      expect(command.name.startsWith('/')).toBe(true);
      expect(command.description.length).toBeGreaterThan(0);
    }
  });
});
