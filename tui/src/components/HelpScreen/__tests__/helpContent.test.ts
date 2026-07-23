import { describe, expect, it } from 'vitest';
import {
  buildCommandSection,
  buildHelpSections,
  flattenHelpLines
} from '@libs/help/helpContent.ts';
import { COMMAND_REGISTRY } from '@libs/commands/registry.ts';

describe('helpContent', () => {
  it('derives the COMMANDS section from the shared command registry', () => {
    const section = buildCommandSection();

    expect(section.title).toBe('COMMANDS');
    expect(section.entries).toHaveLength(COMMAND_REGISTRY.length);
    for (const command of COMMAND_REGISTRY) {
      const entry = section.entries.find((candidate) => candidate.keys === command.name);
      expect(entry?.description).toBe(command.description);
    }
  });

  it('lists commands first, then the keybinding sections', () => {
    const titles = buildHelpSections().map((section) => section.title);

    expect(titles[0]).toBe('COMMANDS');
    expect(titles).toEqual(['COMMANDS', 'GLOBAL', 'INPUT', 'COMMAND MENU', 'SCROLL']);
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
