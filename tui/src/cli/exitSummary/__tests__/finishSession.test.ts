import { createStore } from 'jotai';
import { afterEach, describe, expect, it, vi } from 'vitest';

const printExitSummary = vi.fn();
vi.mock('@/cli/exitSummary/printExitSummary.ts', () => ({
  printExitSummary: (deps: unknown) => printExitSummary(deps)
}));

const { finishSession } = await import('@/cli/exitSummary/finishSession.ts');

afterEach(() => {
  vi.clearAllMocks();
});

describe('finishSession', () => {
  it('disposes the app before printing the card so the terminal is restored first', () => {
    const order: string[] = [];
    const dispose = vi.fn(() => order.push('dispose'));
    printExitSummary.mockImplementation(() => order.push('print'));
    const store = createStore();

    finishSession({ store, dispose });

    expect(order).toEqual(['dispose', 'print']);
    expect(printExitSummary).toHaveBeenCalledWith({ store });
  });
});
