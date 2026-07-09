import { describe, expect, it } from 'vitest';
import {
  commandSubcommands,
  entryFullName,
  hasSubcommands,
  subcommandFullName
} from '@libs/commands/subcommands.ts';
import { COMMAND_REGISTRY, CommandId, MemorySubcommandId } from '@libs/commands/registry.ts';

const command = (id: CommandId) => COMMAND_REGISTRY.find((entry) => entry.id === id)!;

describe('memory subcommands', () => {
  it('declares the composer-supported memory subcommands without reload', () => {
    const subcommands = commandSubcommands(command(CommandId.Memory));

    expect(subcommands.map((subcommand) => subcommand.id)).toEqual([
      MemorySubcommandId.Add,
      MemorySubcommandId.Show,
      MemorySubcommandId.Inbox,
      MemorySubcommandId.Edit,
      MemorySubcommandId.Forget
    ]);
    expect(subcommands.map((subcommand) => subcommand.name)).not.toContain('reload');
    for (const subcommand of subcommands) {
      expect(subcommand.description.length).toBeGreaterThan(0);
    }
  });

  it('formats parent and subcommand entries', () => {
    const memory = command(CommandId.Memory);
    const inbox = commandSubcommands(memory).find((subcommand) => subcommand.id === MemorySubcommandId.Inbox)!;

    expect(subcommandFullName(memory, inbox)).toBe('/memory inbox');
    expect(entryFullName({ kind: 'subcommand', parent: memory, subcommand: inbox })).toBe('/memory inbox');
    expect(entryFullName({ kind: 'command', command: memory })).toBe('/memory');
  });

  it('reports empty subcommands for flat commands', () => {
    const clear = command(CommandId.Clear);

    expect(hasSubcommands(clear)).toBe(false);
    expect(commandSubcommands(clear)).toEqual([]);
  });
});
