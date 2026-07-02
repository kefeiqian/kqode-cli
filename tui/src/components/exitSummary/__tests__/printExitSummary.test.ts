import { createStore } from 'jotai';
import { describe, expect, it, vi } from 'vitest';
import { printExitSummary } from '@components/exitSummary/printExitSummary.ts';
import type { Colorize } from '@components/exitSummary/types.ts';
import {
  sessionGitBaselineAtom,
  sessionStartedAtAtom,
  workspaceCwdAtom
} from '@state/global/index.ts';

const identity: Colorize = (text) => text;

function seededStore() {
  const store = createStore();
  store.set(sessionStartedAtAtom, 1_000);
  store.set(sessionGitBaselineAtom, { insertions: 0, deletions: 0 });
  store.set(workspaceCwdAtom, '/repo');
  return store;
}

function fakeStream(overrides: Partial<NodeJS.WriteStream>): {
  stream: NodeJS.WriteStream;
  write: ReturnType<typeof vi.fn>;
} {
  const write = vi.fn();
  const stream = { write, isTTY: true, columns: 80, ...overrides } as unknown as NodeJS.WriteStream;
  return { stream, write };
}

describe('printExitSummary', () => {
  it('writes the card to a TTY stream with the computed values', () => {
    const { stream, write } = fakeStream({});

    printExitSummary({
      store: seededStore(),
      stream,
      now: () => 126_000,
      readLineDelta: () => ({ insertions: 12, deletions: 4 }),
      colorize: identity
    });

    expect(write).toHaveBeenCalledOnce();
    const output = write.mock.calls[0][0] as string;
    expect(output).toContain('Changes');
    expect(output).toContain('+12 −4');
    expect(output).toContain('2m 5s');
    expect(output.endsWith('\n')).toBe(true);
  });

  it('does not write to a non-TTY stream', () => {
    const { stream, write } = fakeStream({ isTTY: false });

    printExitSummary({
      store: seededStore(),
      stream,
      now: () => 2_000,
      readLineDelta: () => ({ insertions: 0, deletions: 0 }),
      colorize: identity
    });

    expect(write).not.toHaveBeenCalled();
  });

  it('threads terminal width from stream.columns so a narrow terminal drops the border', () => {
    const { stream, write } = fakeStream({ columns: 15 });

    printExitSummary({
      store: seededStore(),
      stream,
      now: () => 6_000,
      readLineDelta: () => ({ insertions: 0, deletions: 0 }),
      colorize: identity
    });

    const output = write.mock.calls[0][0] as string;
    expect(output).not.toContain('╭');
    expect(output).toContain('Changes');
  });

  it('never throws when computing the summary fails', () => {
    const { stream, write } = fakeStream({});

    expect(() =>
      printExitSummary({
        store: seededStore(),
        stream,
        now: () => 2_000,
        readLineDelta: () => {
          throw new Error('git blew up');
        },
        colorize: identity
      })
    ).not.toThrow();
    expect(write).not.toHaveBeenCalled();
  });
});
