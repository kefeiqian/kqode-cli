import type { CommandDefinition, SubcommandDefinition } from '@libs/commands/registry.ts';

export type CommandMenuEntry = {
  kind: 'command';
  command: CommandDefinition;
};

export type SubcommandMenuEntry = {
  kind: 'subcommand';
  parent: CommandDefinition;
  subcommand: SubcommandDefinition;
};

export type MenuEntry = CommandMenuEntry | SubcommandMenuEntry;

export function commandSubcommands(command: CommandDefinition): readonly SubcommandDefinition[] {
  return command.subcommands ?? [];
}

export function hasSubcommands(command: CommandDefinition): boolean {
  return commandSubcommands(command).length > 0;
}

export function subcommandFullName(
  command: CommandDefinition,
  subcommand: SubcommandDefinition
): string {
  return `${command.name} ${subcommand.name}`;
}

export function entryFullName(entry: MenuEntry): string {
  if (entry.kind === 'command') {
    return entry.command.name;
  }

  return subcommandFullName(entry.parent, entry.subcommand);
}

export function entryDescription(entry: MenuEntry): string {
  return entry.kind === 'command' ? entry.command.description : entry.subcommand.description;
}

