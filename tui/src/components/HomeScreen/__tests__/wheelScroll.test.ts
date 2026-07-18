import { createStore } from 'jotai';
import { describe, expect, it, vi } from 'vitest';
import { MOUSE_WHEEL_SCROLL_ROWS } from '@constants/ui.ts';
import { handleWheelScroll } from '@components/HomeScreen/wheelScroll.ts';
import {
  bodyEntriesAtom,
  bodyScrollOffsetRowsAtom,
  columnsTestOverrideAtom,
  rowsTestOverrideAtom
} from '@state/ui/index.ts';

describe('handleWheelScroll', () => {
  it('applies every body notch from a batched input chunk', () => {
    const store = createStore();
    store.set(columnsTestOverrideAtom, 80);
    store.set(rowsTestOverrideAtom, 24);
    store.set(
      bodyEntriesAtom,
      Array.from({ length: 80 }, (_, index) => ({
        kind: 'assistant' as const,
        text: `line ${index}`
      }))
    );
    const notifyScroll = vi.fn();

    handleWheelScroll(
      store,
      Array.from({ length: 3 }, () => ({ direction: 'up' as const, row: 2 })),
      notifyScroll
    );
    expect(store.get(bodyScrollOffsetRowsAtom)).toBe(3 * MOUSE_WHEEL_SCROLL_ROWS);
    expect(notifyScroll).toHaveBeenCalledTimes(1);
  });

  it('does nothing for an empty wheel batch', () => {
    const notifyScroll = vi.fn();
    handleWheelScroll(createStore(), [], notifyScroll);
    expect(notifyScroll).not.toHaveBeenCalled();
  });
});
