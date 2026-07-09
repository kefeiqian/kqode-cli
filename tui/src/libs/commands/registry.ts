/**
 * Client-side slash commands available in the TUI composer.
 *
 * This registry is the single source of truth for command identity, display
 * name, and description. Adding a command is one entry here — the menu,
 * filtering, help output, and execution all derive from it.
 */

/** Stable identifiers for the built-in slash commands. */
export const CommandId = {
  Help: 'help',
  Clear: 'clear',
  Exit: 'exit',
  Connect: 'connect',
  Model: 'model',
  Resume: 'resume',
  Memory: 'memory',
  Theme: 'theme'
} as const;

export type CommandId = (typeof CommandId)[keyof typeof CommandId];

/** Slash names for built-in commands. */
export const CommandName = {
  Help: '/help',
  Clear: '/clear',
  Exit: '/exit',
  Connect: '/connect',
  Model: '/model',
  Resume: '/resume',
  Memory: '/memory',
  Theme: '/theme'
} as const;

/** Stable identifiers for `/memory` subcommands. */
export const MemorySubcommandId = {
  Add: 'add',
  Show: 'show',
  Inbox: 'inbox',
  Edit: 'edit',
  Forget: 'forget'
} as const;

export type MemorySubcommandId = (typeof MemorySubcommandId)[keyof typeof MemorySubcommandId];

/** A single slash subcommand token declared under a parent command. */
export type SubcommandDefinition = {
  id: string;
  name: string;
  description: string;
};

/** A single slash command: its id, the `/name` shown in the menu, and a short description. */
export type CommandDefinition = {
  id: CommandId;
  name: string;
  description: string;
  subcommands?: readonly SubcommandDefinition[];
};

/**
 * Built-in commands, exported sorted alphabetically by name so the menu, filter
 * results, and help listing always appear in a predictable `/clear`, `/exit`,
 * `/help` order regardless of the order entries are declared here. Adding a
 * command is still one entry below — the sort keeps display order consistent.
 */
const BUILT_IN_COMMANDS: readonly CommandDefinition[] = [
  { id: CommandId.Help, name: CommandName.Help, description: 'Show available commands' },
  { id: CommandId.Clear, name: CommandName.Clear, description: 'Clear the conversation and scrollback' },
  { id: CommandId.Exit, name: CommandName.Exit, description: 'Exit KQode' },
  { id: CommandId.Connect, name: CommandName.Connect, description: 'Connect or update provider credentials' },
  { id: CommandId.Model, name: CommandName.Model, description: 'Choose the active provider model' },
  { id: CommandId.Resume, name: CommandName.Resume, description: 'Resume a saved local session' },
  {
    id: CommandId.Memory,
    name: CommandName.Memory,
    description: 'Manage local memory',
    subcommands: [
      { id: MemorySubcommandId.Add, name: 'add', description: 'Add a project memory' },
      { id: MemorySubcommandId.Show, name: 'show', description: 'Show active memory' },
      { id: MemorySubcommandId.Inbox, name: 'inbox', description: 'Review memory inbox candidates' },
      { id: MemorySubcommandId.Edit, name: 'edit', description: 'Edit an active memory' },
      { id: MemorySubcommandId.Forget, name: 'forget', description: 'Forget an active memory' }
    ]
  },
  { id: CommandId.Theme, name: CommandName.Theme, description: 'Choose a color theme' }
];

export const COMMAND_REGISTRY: readonly CommandDefinition[] = [...BUILT_IN_COMMANDS].sort((a, b) =>
  a.name.localeCompare(b.name)
);
