import ansiEscapes from 'ansi-escapes';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  buildCursorOnlySequence,
  buildCursorSuffix
} from '../../node_modules/ink/build/cursor-helpers.js';

const showCursor = '\u001B[?25h';
const hideCursor = '\u001B[?25l';

describe('patched Ink fullscreen cursor baseline', () => {
  it('treats the final visible row as the bottom when output has no newline', () => {
    expect(
      buildCursorSuffix(3, { x: 2, y: 2 }, false)
    ).toBe(`${ansiEscapes.cursorTo(2)}${showCursor}`);

    expect(
      buildCursorSuffix(3, { x: 2, y: 2 }, true)
    ).toBe(`${ansiEscapes.cursorUp(1)}${ansiEscapes.cursorTo(2)}${showCursor}`);
  });

  it('moves cursor-only updates from the physical bottom without vertical drift', () => {
    expect(
      buildCursorOnlySequence({
        cursorWasShown: true,
        previousLineCount: 3,
        previousCursorPosition: { x: 4, y: 2 },
        visibleLineCount: 3,
        cursorPosition: { x: 3, y: 1 },
        hasTrailingNewline: false
      })
    ).toBe(
      `${hideCursor}${ansiEscapes.cursorTo(0)}${ansiEscapes.cursorUp(1)}${ansiEscapes.cursorTo(3)}${showCursor}`
    );
  });

  it('writes the same newline shape that clear-terminal synchronization records', () => {
    const testDir = path.dirname(fileURLToPath(import.meta.url));
    const inkSource = fs.readFileSync(
      path.resolve(testDir, '../../node_modules/ink/build/ink.js'),
      'utf8'
    );

    expect(inkSource).toContain(
      'ansiEscapes.clearTerminal + this.fullStaticOutput + outputToRender'
    );
  });
});
