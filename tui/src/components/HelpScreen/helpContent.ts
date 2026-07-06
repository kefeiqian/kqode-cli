import { COMMAND_REGISTRY } from '@libs/commands/registry.ts';

/** A single row inside a help section: a key/command label and what it does. */
export type HelpEntry = { keys: string; description: string };

/** A titled group of related help entries (e.g. `GLOBAL`, `INPUT`). */
export type HelpSection = { title: string; entries: readonly HelpEntry[] };

/** A flattened, ready-to-render help line tagged for styling and scrolling. */
export type HelpLine =
  | { kind: 'title'; text: string }
  | { kind: 'entry'; text: string }
  | { kind: 'blank'; text: '' };

const INDENT = '  ';
const KEY_DESCRIPTION_GAP = 2;

/**
 * Keybinding reference sections. These mirror the shortcuts actually wired in
 * the TUI (`useGlobalKeys`, `usePromptComposerInput`, and the home-screen scroll
 * handler), so the viewer stays truthful rather than aspirational.
 */
const KEYBINDING_SECTIONS: readonly HelpSection[] = [
  {
    title: 'GLOBAL',
    entries: [
      { keys: '/', description: 'Open the command menu' },
      { keys: 'ctrl+r', description: 'Toggle Copy Mode for terminal-native selection' },
      { keys: 'ctrl+c ×2', description: 'Exit KQode' },
      { keys: 'esc', description: 'Clear the prompt · close the command menu' }
    ]
  },
  {
    title: 'INPUT',
    entries: [
      { keys: 'enter', description: 'Submit the prompt' },
      { keys: 'shift+enter', description: 'Insert a newline' },
      { keys: '\\ then enter', description: 'Insert a newline' },
      { keys: '← / →', description: 'Move the cursor' },
      { keys: 'backspace', description: 'Delete the previous character' },
      { keys: 'ctrl+v / alt+v / right-click', description: 'Paste from the system clipboard' }
    ]
  },
  {
    title: 'CLIPBOARD',
    entries: [{ keys: 'ctrl+o', description: 'Copy the last assistant response' }]
  },
  {
    title: 'COMMAND MENU',
    entries: [
      { keys: '↑ / ↓', description: 'Move between commands' },
      { keys: 'tab', description: 'Complete the highlighted command' },
      { keys: 'enter', description: 'Run the highlighted command' },
      { keys: 'esc', description: 'Close the command menu' }
    ]
  },
  {
    title: 'SCROLL',
    entries: [
      { keys: 'page up / page down', description: 'Scroll the transcript' },
      { keys: 'end', description: 'Jump to the latest output' },
      { keys: 'mouse wheel', description: 'Scroll the transcript' }
    ]
  }
];

/** The `COMMANDS` section, derived from the shared slash-command registry. */
export function buildCommandSection(): HelpSection {
  return {
    title: 'COMMANDS',
    entries: COMMAND_REGISTRY.map((command) => ({
      keys: command.name,
      description: command.description
    }))
  };
}

/** All help sections in display order: slash commands first, then keybindings. */
export function buildHelpSections(): HelpSection[] {
  return [buildCommandSection(), ...KEYBINDING_SECTIONS];
}

/**
 * Flattens `sections` into styled lines with a blank separator between sections.
 * Entry keys are padded to a shared column width so descriptions line up across
 * every section, matching the aligned two-column layout of the reference pager.
 */
export function flattenHelpLines(sections: readonly HelpSection[]): HelpLine[] {
  const keyWidth = sections.reduce(
    (widest, section) =>
      section.entries.reduce((inner, entry) => Math.max(inner, entry.keys.length), widest),
    0
  );

  const lines: HelpLine[] = [];
  sections.forEach((section, index) => {
    if (index > 0) {
      lines.push({ kind: 'blank', text: '' });
    }
    lines.push({ kind: 'title', text: section.title });
    for (const entry of section.entries) {
      const keys = entry.keys.padEnd(keyWidth + KEY_DESCRIPTION_GAP);
      lines.push({ kind: 'entry', text: `${INDENT}${keys}${entry.description}` });
    }
  });
  return lines;
}
