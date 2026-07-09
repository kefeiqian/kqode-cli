import { CommandId } from '@libs/commands/registry.ts';

/** Client-side side effects a command can trigger; injected by the composer. */
export type CommandActions = {
  exit: () => void;
  clearTranscript: () => void;
  showHelp: () => void;
  openLogin: () => void;
  openModel: () => void | Promise<void>;
  openResume: () => void | Promise<void>;
  openMemory: () => void | Promise<void>;
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
      void actions.openMemory();
      return;
  }
}
