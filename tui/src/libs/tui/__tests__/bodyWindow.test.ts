import { describe, expect, it } from 'vitest';
import { BodyEntryKind } from '@constants/bodyEntry.ts';
import { resolveBodyRowWindow } from '@libs/tui/bodyWindow.ts';
import { DEFAULT_THEME } from '@theme/themeConfig.ts';

const MULTILINE = Array.from({ length: 10 }, (_, index) => `line ${index}`).join('\n');
const entries = [{ kind: BodyEntryKind.Success, text: MULTILINE }];

describe('resolveBodyRowWindow', () => {
  it('pins the window to the newest rows at scroll offset 0', () => {
    const window = resolveBodyRowWindow(entries, 40, 4, 0, DEFAULT_THEME);

    expect(window.visibleRows).toHaveLength(4);
    expect(window.startIndex).toBe(window.allRows.length - 4);
    expect(window.visibleRows).toEqual(window.allRows.slice(window.startIndex, window.startIndex + 4));
  });

  it('scrolls the window up as the offset grows', () => {
    const bottom = resolveBodyRowWindow(entries, 40, 4, 0, DEFAULT_THEME);
    const scrolled = resolveBodyRowWindow(entries, 40, 4, 3, DEFAULT_THEME);

    expect(scrolled.startIndex).toBe(bottom.startIndex - 3);
  });

  it('clamps an over-scroll to the top of the transcript', () => {
    const window = resolveBodyRowWindow(entries, 40, 4, 999, DEFAULT_THEME);

    expect(window.startIndex).toBe(0);
  });

  it('returns an empty window for an empty transcript', () => {
    const window = resolveBodyRowWindow([], 40, 4, 0, DEFAULT_THEME);

    expect(window.allRows).toEqual([]);
    expect(window.visibleRows).toEqual([]);
    expect(window.startIndex).toBe(0);
  });
});
