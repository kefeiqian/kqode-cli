import { describe, expect, it } from 'vitest';
import { filterCommands } from '@libs/commands/filterCommands.ts';
import { COMMAND_REGISTRY, CommandId } from '@libs/commands/registry.ts';
import { entryFullName } from '@libs/commands/subcommands.ts';

const ids = (query: string) =>
  filterCommands(query).map((entry) => (entry.kind === 'command' ? entry.command.id : entry.subcommand.id));

describe('filterCommands', () => {
  it('returns all commands sorted alphabetically by name for an empty query', () => {
    expect(ids('')).toEqual([
      CommandId.Clear,
      CommandId.Connect,
      CommandId.Exit,
      CommandId.Help,
      CommandId.Memory,
      CommandId.Model,
      CommandId.Resume,
      CommandId.Theme
    ]);
  });

  it('prefix-matches command names', () => {
    expect(ids('cl')).toEqual([CommandId.Clear]);
  });

  it('is case-insensitive', () => {
    expect(ids('CL')).toEqual([CommandId.Clear]);
  });

  it('trims trailing whitespace and a leading slash', () => {
    expect(ids('clear ')).toEqual([CommandId.Clear]);
    expect(ids('/clear')).toEqual([CommandId.Clear]);
  });

  it('returns no matches for an unknown query', () => {
    expect(filterCommands('zzz')).toEqual([]);
  });

  it('expands a bare parent command into its subcommands', () => {
    expect(filterCommands('/memory').map(entryFullName)).toEqual([
      '/memory',
      '/memory add',
      '/memory show',
      '/memory inbox',
      '/memory edit',
      '/memory forget'
    ]);
  });

  it('filters subcommands by prefix without keeping the parent entry', () => {
    expect(filterCommands('/memory e').map(entryFullName)).toEqual(['/memory edit']);
    expect(filterCommands('/memory   in').map(entryFullName)).toEqual(['/memory inbox']);
  });
});

describe('COMMAND_REGISTRY', () => {
  it('contains exactly built-in commands sorted alphabetically with non-empty descriptions', () => {
    expect(COMMAND_REGISTRY.map((command) => command.id)).toEqual([
      CommandId.Clear,
      CommandId.Connect,
      CommandId.Exit,
      CommandId.Help,
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
