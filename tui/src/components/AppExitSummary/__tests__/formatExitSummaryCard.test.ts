import { describe, expect, it } from 'vitest';
import { formatExitSummaryCard } from '@components/AppExitSummary/formatExitSummaryCard.ts';
import type { Colorize } from '@components/AppExitSummary/types.ts';

const identity: Colorize = (text) => text;

describe('formatExitSummaryCard', () => {
  it('renders a bordered banner card with only the rows that carry data (covers R2, R3, R10)', () => {
    const card = formatExitSummaryCard(
      { changes: { insertions: 12, deletions: 4 }, durationMs: 125_000 },
      { colorize: identity, columns: 80 }
    );

    // Rounded border + block banner on top of the stat rows.
    expect(card).toContain('╭');
    expect(card).toContain('╯');
    expect(card).toContain('█');
    expect(card).toContain('+12 −4');
    expect(card).toContain('2m 5s');

    // Cost, Tokens, and Resume have no data yet, so they are omitted entirely.
    expect(card).not.toContain('—');
    expect(card).not.toContain('Cost');
    expect(card).not.toContain('Tokens');
    expect(card).not.toContain('Resume');

    // The rows present keep their order: Changes before Duration.
    const changesIndex = card.indexOf('Changes');
    const durationIndex = card.indexOf('Duration');
    expect(changesIndex).toBeGreaterThanOrEqual(0);
    expect(durationIndex).toBeGreaterThan(changesIndex);
  });

  it('omits the Changes row when unavailable, e.g. non-repo (covers AE3)', () => {
    const card = formatExitSummaryCard(
      { changes: undefined, durationMs: 1_000 },
      { colorize: identity, columns: 80 }
    );

    // Empty rows are dropped rather than shown as a placeholder.
    expect(card).not.toContain('Changes');
    expect(card).not.toContain('—');
    expect(card).toContain('Duration');
    expect(card).toContain('1s');
  });

  it('omits every row when no stat has data', () => {
    const card = formatExitSummaryCard(
      { changes: undefined, durationMs: undefined },
      { colorize: identity, columns: 80 }
    );

    expect(card).not.toContain('Changes');
    expect(card).not.toContain('Duration');
    expect(card).not.toContain('—');
    // Only the bordered block banner remains — no stat rows.
    expect(card).toContain('╭');
    expect(card).toContain('█');
  });

  it('degrades to a single-line wordmark box when the banner will not fit (covers R11)', () => {
    const card = formatExitSummaryCard(
      { changes: { insertions: 0, deletions: 0 }, durationMs: 1_000 },
      { colorize: identity, columns: 30 }
    );

    expect(card).toContain('╭');
    expect(card).toContain('KQode');
    expect(card).not.toContain('█');
  });

  it('drops the border and stacks the populated rows plainly on a very narrow terminal (covers R11)', () => {
    const card = formatExitSummaryCard(
      { changes: { insertions: 0, deletions: 0 }, durationMs: 0 },
      { colorize: identity, columns: 15 }
    );
    const lines = card.split('\n');

    expect(card).not.toContain('╭');
    // Only Changes and Duration carry data, so exactly two rows stack.
    expect(lines).toHaveLength(2);
    expect(lines[0].startsWith('Changes')).toBe(true);
    expect(lines[1].startsWith('Duration')).toBe(true);
    expect(card).toContain('+0 −0');
  });

  it('leaves text uncolored under the identity seam so it stays background-agnostic', () => {
    const card = formatExitSummaryCard(
      { changes: { insertions: 1, deletions: 1 }, durationMs: 1_000 },
      { colorize: identity, columns: 80 }
    );

    expect(card).not.toContain('\u001B[');
  });
});
