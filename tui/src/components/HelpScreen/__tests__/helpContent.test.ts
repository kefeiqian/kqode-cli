import { describe, expect, it } from 'vitest';
import {
  buildCommandSection,
  buildHelpSections,
  flattenHelpLines
} from '@components/HelpScreen/helpContent.ts';
import { COMMAND_REGISTRY } from '@libs/commands/registry.ts';
import { commandSubcommands, subcommandFullName } from '@libs/commands/subcommands.ts';

describe('helpContent', () => {
  it('derives the COMMANDS section from the shared command registry', () => {
    const section = buildCommandSection();

    expect(section.title).toBe('COMMANDS');
    const expectedLength = COMMAND_REGISTRY.reduce(
      (total, command) => total + 1 + commandSubcommands(command).length,
      0
    );
    expect(section.entries).toHaveLength(expectedLength);
    for (const command of COMMAND_REGISTRY) {
      const entry = section.entries.find((candidate) => candidate.keys === command.name);
      expect(entry?.description).toBe(command.description);
      for (const subcommand of commandSubcommands(command)) {
        const subEntry = section.entries.find(
          (candidate) => candidate.keys === subcommandFullName(command, subcommand)
        );
        expect(subEntry?.description).toBe(subcommand.description);
      }
    }
  });

  it('documents memory subcommands in the COMMANDS section', () => {
    const entries = buildCommandSection().entries.map((entry) => entry.keys);

    expect(entries).toContain('/memory add');
    expect(entries).toContain('/memory inbox');
    expect(entries).toContain('/memory edit');
    expect(entries).toContain('/memory forget');
  });

  it('lists commands first, then the keybinding sections', () => {
    const titles = buildHelpSections().map((section) => section.title);

    expect(titles[0]).toBe('COMMANDS');
    expect(titles).toEqual([
      'COMMANDS',
      'GLOBAL',
      'INPUT',
      'CLIPBOARD',
      'SELECTION',
      'COMMAND MENU',
      'SCROLL'
    ]);
  });

  it('documents copy, paste, and selection shortcuts', () => {
    const joined = flattenHelpLines(buildHelpSections())
      .map((line) => line.text)
      .join('\n');
    const expected = [
      'drag',
      'double-click',
      'triple-click',
      'ctrl+o',
      'Copy the last assistant response',
      'ctrl+c ×2',
      'Exit KQode when no selection is active',
      'ctrl+v / cmd+v',
      'Paste from the system clipboard',
      'ctrl+c / cmd+c',
      'Copy the selection, then dismiss it',
      'other keys',
      'Dismiss the highlight; scroll keys keep it'
    ];
    const forbidden = [
      'ctrl+r',
      'Copy Mode',
      'cmd+o',
      'ctrl+v / alt+v / cmd+v',
      'ctrl+v / alt+v / right-click'
    ];

    // Mode-less selection: drag to highlight, multi-click, right-click to copy;
    // no Ctrl+R Copy Mode.
    for (const text of expected) {
      expect(joined).toContain(text);
    }
    for (const text of forbidden) {
      expect(joined).not.toContain(text);
    }
    // Right-click and keyboard shortcuts copy the selection instead of pasting.
    expect(joined).toContain('right-click');
  });

  it('flattens sections into title, entry, and blank-separator lines', () => {
    const sections = buildHelpSections();
    const lines = flattenHelpLines(sections);

    const titleLines = lines.filter((line) => line.kind === 'title').map((line) => line.text);
    expect(titleLines).toEqual(sections.map((section) => section.title));

    // One blank separator sits between each adjacent pair of sections.
    const blankCount = lines.filter((line) => line.kind === 'blank').length;
    expect(blankCount).toBe(sections.length - 1);

    const entryCount = lines.filter((line) => line.kind === 'entry').length;
    const expectedEntries = sections.reduce((total, section) => total + section.entries.length, 0);
    expect(entryCount).toBe(expectedEntries);
  });

  it('renders each command name and description in the flattened output', () => {
    const joined = flattenHelpLines(buildHelpSections())
      .map((line) => line.text)
      .join('\n');

    for (const command of COMMAND_REGISTRY) {
      expect(joined).toContain(command.name);
      expect(joined).toContain(command.description);
    }
  });

  it('aligns entry descriptions to a shared key column across sections', () => {
    const sections = buildHelpSections();
    const entries = sections.flatMap((section) => section.entries);
    const entryLines = flattenHelpLines(sections).filter((line) => line.kind === 'entry');

    // The i-th flattened entry line corresponds to the i-th registry/keybinding
    // entry, so its description must begin at the same column for every row.
    const descriptionColumns = entryLines.map((line, index) =>
      line.text.indexOf(entries[index]?.description ?? '')
    );

    expect(descriptionColumns).not.toContain(-1);
    expect(new Set(descriptionColumns).size).toBe(1);
  });
});
