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
  Exit: 'exit'
} as const;

export type CommandId = (typeof CommandId)[keyof typeof CommandId];

/** A single slash command: its id, the `/name` shown in the menu, and a short description. */
export type CommandDefinition = {
  id: CommandId;
  name: string;
  description: string;
};

/**
 * Built-in commands in display order. `/help` is first so the default-highlighted
 * entry is non-destructive: a reflexive Enter on a just-typed `/` runs `/help`,
 * never `/exit`.
 */
export const COMMAND_REGISTRY: readonly CommandDefinition[] = [
  { id: CommandId.Help, name: '/help', description: 'Show available commands' },
  { id: CommandId.Clear, name: '/clear', description: 'Clear the conversation and scrollback' },
  { id: CommandId.Exit, name: '/exit', description: 'Exit KQode' }
];
