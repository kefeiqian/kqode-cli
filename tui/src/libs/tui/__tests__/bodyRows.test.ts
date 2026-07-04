import { describe, expect, it } from 'vitest';
import { BodyEntryKind } from '@constants/bodyEntry.ts';
import { resolveBodyRows } from '@libs/tui/bodyRows.ts';

const WIDE_COLUMNS = 80;
const TALL_ROWS = 40;

function rowTexts(kind: BodyEntryKind, text: string): string[] {
  return resolveBodyRows([{ kind, text }], WIDE_COLUMNS, TALL_ROWS).map((row) => row.text);
}

describe('resolveBodyRows hard line breaks', () => {
  it('keeps a multi-line backend success result on separate rows', () => {
    const texts = rowTexts(
      BodyEntryKind.Success,
      'Rust backend ACK - received: 1231351365\n1361631'
    );

    expect(texts).toContain('Rust backend ACK - received: 1231351365');
    expect(texts).toContain('1361631');
    expect(texts.some((line) => line.includes('1231351365 1361631'))).toBe(false);
  });

  it('keeps multi-line error output on separate rows', () => {
    const texts = rowTexts(BodyEntryKind.Error, 'first line\nsecond line');

    expect(texts).toContain('ERROR: first line');
    expect(texts).toContain('second line');
  });

  it('preserves author line breaks for multi-line prompts', () => {
    const texts = rowTexts(BodyEntryKind.User, '1231351365\n1361631');

    expect(texts.some((line) => line.includes('1231351365') && !line.includes('1361631'))).toBe(
      true
    );
    expect(texts.some((line) => line.includes('1361631') && !line.includes('1231351365'))).toBe(
      true
    );
  });

  it('still wraps a single long line to the available width', () => {
    const texts = rowTexts(BodyEntryKind.Success, 'x'.repeat(WIDE_COLUMNS + 5));

    expect(texts.length).toBeGreaterThan(1);
    expect(texts.every((line) => line.length <= WIDE_COLUMNS)).toBe(true);
  });
});
