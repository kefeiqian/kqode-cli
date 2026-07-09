import { CommandId, MemorySubcommandId } from '@libs/commands/registry.ts';
import type { MenuEntry } from '@libs/commands/subcommands.ts';

export const CommandMemoryMode = {
  Active: 'active',
  Inbox: 'inbox'
} as const;

export type CommandMemoryMode = (typeof CommandMemoryMode)[keyof typeof CommandMemoryMode];

/** Client-side side effects a command can trigger; injected by the composer. */
export type CommandActions = {
  exit: () => void;
  clearTranscript: () => void;
  showHelp: () => void;
  openLogin: () => void;
  openModel: () => void | Promise<void>;
  openResume: () => void | Promise<void>;
  openMemory: (mode?: CommandMemoryMode) => void | Promise<void>;
  openTheme: () => void | Promise<void>;
};

/**
 * Runs the client-side effect for `id`. The caller is responsible for clearing
 * the composer afterward, so `/help` closes the menu and empties the input.
 */
export function executeCommand(id: CommandId, actions: CommandActions): void {
  switch (id) {
    case CommandId.Exit:
      actions.exit();
      return;
    case CommandId.Clear:
      actions.clearTranscript();
      return;
    case CommandId.Help:
      actions.showHelp();
      return;
    case CommandId.Login:
      actions.openLogin();
      return;
    case CommandId.Model:
      void actions.openModel();
      return;
    case CommandId.Resume:
      void actions.openResume();
      return;
    case CommandId.Memory:
      void actions.openMemory(CommandMemoryMode.Active);
      return;
    case CommandId.Theme:
      void actions.openTheme();
      return;
  }
}

export function executeMenuSelection(entry: MenuEntry, actions: CommandActions): void {
  if (entry.kind === 'command') {
    executeCommand(entry.command.id, actions);
    return;
  }

  if (entry.parent.id === CommandId.Memory) {
    void actions.openMemory(memoryModeForSubcommand(entry.subcommand.id));
  }
}

function memoryModeForSubcommand(id: string): CommandMemoryMode | undefined {
  switch (id) {
    case MemorySubcommandId.Inbox:
      return CommandMemoryMode.Inbox;
    case MemorySubcommandId.Show:
      return CommandMemoryMode.Active;
    default:
      return undefined;
  }
}
