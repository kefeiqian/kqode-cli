import { describe, expect, it } from 'vitest';
import { formatCwdLine, renderCwdLine } from '@libs/tui/cwdLine.ts';

const statusWithPr = {
  label: '⎇ main*',
  pullRequestLabel: '#3',
  pullRequestUrl: 'https://github.com/o/r/pull/3'
};

/** Removes OSC 8 and SGR escapes so decorated text can be compared to plain. */
function stripEscapes(text: string): string {
  return text.replace(/\u001B\]8;;[^\u0007]*\u0007/g, '').replace(/\u001B\[[0-9:;]*m/g, '');
}

describe('formatCwdLine (plain, drives width math)', () => {
  it('joins the cwd, git, and PR segments as plain text', () => {
    expect(formatCwdLine('/tmp/x', statusWithPr)).toContain(' [⎇ main*] [#3]');
  });

  it('never contains escape sequences, even when a PR url is present', () => {
    expect(formatCwdLine('/tmp/x', statusWithPr)).not.toContain('\u001B');
  });
});

describe('renderCwdLine (decorated, for display)', () => {
  it('wraps the PR label in a dotted underline + OSC 8 hyperlink when a url is present', () => {
    expect(renderCwdLine('/tmp/x', statusWithPr)).toContain(
      ' [\u001B]8;;https://github.com/o/r/pull/3\u0007\u001B[4m\u001B[4:3m#3\u001B[24m\u001B]8;;\u0007]'
    );
  });

  it('leaves the PR label plain when there is no url, so the affordance is never a dead link', () => {
    const line = renderCwdLine('/tmp/x', { label: '⎇ main', pullRequestLabel: '#3' });
    expect(line).toContain(' [#3]');
    expect(line).not.toContain('\u001B');
  });

  it('adds only zero-width escapes, so its visible text equals formatCwdLine', () => {
    expect(stripEscapes(renderCwdLine('/tmp/x', statusWithPr))).toBe(
      formatCwdLine('/tmp/x', statusWithPr)
    );
  });

  it('matches formatCwdLine exactly when there is no git status', () => {
    expect(renderCwdLine('/tmp/x', undefined)).toBe(formatCwdLine('/tmp/x', undefined));
  });
});
