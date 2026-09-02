import { describe, expect, it } from 'vitest';
import { formatExitSummaryCard } from '@components/AppExitSummary/formatExitSummaryCard.ts';
import type { Colorize } from '@components/AppExitSummary/types.ts';
import { DEFAULT_THEME } from '@theme/themeConfig.ts';

const identity: Colorize = (text) => text;
const SESSION_ID = '019f5a2b-15e0-7ef1-9ad2-10a132448b7';
const RESUME_COMMAND = `kqode --resume=${SESSION_ID}`;

describe('formatExitSummaryCard', () => {
  it('renders a bordered banner card with only the rows that carry data (covers R2, R3, R10)', () => {
    const card = formatExitSummaryCard(
      { changes: { insertions: 12, deletions: 4 }, durationMs: 125_000, resumeCommand: undefined },
      { colorize: identity, theme: DEFAULT_THEME, columns: 80 }
    );

    // Rounded border + block banner on top of the stat rows.
    expect(card).toContain('╭');
    expect(card).toContain('╯');
    expect(card).toContain('█');
    expect(card).toContain('+12 −4');
    expect(card).toContain('2m 5s');

    // Cost and Tokens have no data yet; Resume is omitted with no resumable session.
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
      { changes: undefined, durationMs: 1_000, resumeCommand: undefined },
      { colorize: identity, theme: DEFAULT_THEME, columns: 80 }
    );

    // Empty rows are dropped rather than shown as a placeholder.
    expect(card).not.toContain('Changes');
    expect(card).not.toContain('—');
    expect(card).toContain('Duration');
    expect(card).toContain('1s');
  });

  it('omits every row when no stat has data', () => {
    const card = formatExitSummaryCard(
      { changes: undefined, durationMs: undefined, resumeCommand: undefined },
      { colorize: identity, theme: DEFAULT_THEME, columns: 80 }
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
      { changes: { insertions: 0, deletions: 0 }, durationMs: 1_000, resumeCommand: undefined },
      { colorize: identity, theme: DEFAULT_THEME, columns: 30 }
    );

    expect(card).toContain('╭');
    expect(card).toContain('KQode');
    expect(card).not.toContain('█');
  });

  it('drops the border and stacks the populated rows plainly on a very narrow terminal (covers R11)', () => {
    const card = formatExitSummaryCard(
      { changes: { insertions: 0, deletions: 0 }, durationMs: 0, resumeCommand: undefined },
      { colorize: identity, theme: DEFAULT_THEME, columns: 15 }
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
      { changes: { insertions: 1, deletions: 1 }, durationMs: 1_000, resumeCommand: undefined },
      { colorize: identity, theme: DEFAULT_THEME, columns: 80 }
    );

    expect(card).not.toContain('\u001B[');
  });

  it('renders the Resume row with the command when the session is resumable (covers R1, R2)', () => {
    const card = formatExitSummaryCard(
      {
        changes: { insertions: 3, deletions: 1 },
        durationMs: 5_000,
        resumeCommand: RESUME_COMMAND
      },
      { colorize: identity, theme: DEFAULT_THEME, columns: 80 }
    );

    expect(card).toContain('Resume');
    expect(card).toContain(RESUME_COMMAND);
    // Resume follows the other stat rows.
    expect(card.indexOf('Duration')).toBeLessThan(card.indexOf('Resume'));
  });

  it('shows the Resume row for a resumable no-provider session (covers corrected AE2)', () => {
    const card = formatExitSummaryCard(
      {
        changes: undefined,
        durationMs: 2_000,
        resumeCommand: RESUME_COMMAND
      },
      { colorize: identity, theme: DEFAULT_THEME, columns: 80 }
    );
    expect(card).toContain('Resume');
    expect(card).toContain(RESUME_COMMAND);
  });

  it('preserves the full session id when the card degrades on a narrow terminal (covers R4)', () => {
    const card = formatExitSummaryCard(
      { changes: undefined, durationMs: undefined, resumeCommand: RESUME_COMMAND },
      { colorize: identity, theme: DEFAULT_THEME, columns: 20 }
    );

    expect(card).toContain(SESSION_ID);
  });

  it('does not colorize the resume command (only Changes uses the color seam)', () => {
    const mark: Colorize = (text) => `<C>${text}</C>`;
    const card = formatExitSummaryCard(
      {
        changes: { insertions: 2, deletions: 1 },
        durationMs: 1_000,
        resumeCommand: RESUME_COMMAND
      },
      { colorize: mark, theme: DEFAULT_THEME, columns: 80 }
    );

    expect(card).toContain('<C>'); // Changes is colorized...
    expect(card).toContain(RESUME_COMMAND); // ...but the resume command is plain.
    expect(card).not.toContain('<C>kqode');
    expect(card).not.toContain(`${SESSION_ID}</C>`);
  });
});
