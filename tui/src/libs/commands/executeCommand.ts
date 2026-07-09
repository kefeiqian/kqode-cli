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
  openConnect: () => void;
  openModel: () => void | Promise<void>;
  openResume: () => void | Promise<void>;
  openMemory: (mode?: CommandMemoryMode) => void | Promise<void>;
  openMemoryAdd: () => void | Promise<void>;
  openMemoryEdit: () => void | Promise<void>;
  openMemoryForget: () => void | Promise<void>;
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
    case CommandId.Connect:
      actions.openConnect();
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
    if (entry.subcommand.id === MemorySubcommandId.Add) {
      void actions.openMemoryAdd();
      return;
    }
    if (entry.subcommand.id === MemorySubcommandId.Edit) {
      void actions.openMemoryEdit();
      return;
    }
    if (entry.subcommand.id === MemorySubcommandId.Forget) {
      void actions.openMemoryForget();
      return;
    }
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
