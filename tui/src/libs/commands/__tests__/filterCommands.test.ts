import { describe, expect, it } from 'vitest';
import { filterCommands } from '@libs/commands/filterCommands.ts';
import { COMMAND_REGISTRY, CommandId } from '@libs/commands/registry.ts';

describe('filterCommands', () => {
  it('returns all commands sorted alphabetically by name for an empty query', () => {
    expect(filterCommands('').map((command) => command.id)).toEqual([
      CommandId.Clear,
      CommandId.Exit,
      CommandId.Help,
      CommandId.Login,
      CommandId.Memory,
      CommandId.Model,
      CommandId.Resume,
      CommandId.Theme
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
  it('contains exactly built-in commands sorted alphabetically with non-empty descriptions', () => {
    expect(COMMAND_REGISTRY.map((command) => command.id)).toEqual([
      CommandId.Clear,
      CommandId.Exit,
      CommandId.Help,
      CommandId.Login,
      CommandId.Memory,
      CommandId.Model,
      CommandId.Resume,
      CommandId.Theme
    ]);

    expect(COMMAND_REGISTRY.map((command) => command.name)).toEqual([...COMMAND_REGISTRY]
      .map((command) => command.name)
      .sort((a, b) => a.localeCompare(b)));

    for (const command of COMMAND_REGISTRY) {
      expect(command.name.startsWith('/')).toBe(true);
      expect(command.description.length).toBeGreaterThan(0);
    }
  });
});
