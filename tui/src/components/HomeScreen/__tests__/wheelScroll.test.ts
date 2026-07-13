import { createStore } from 'jotai';
import { describe, expect, it, vi } from 'vitest';
import { BodyEntryKind } from '@constants/bodyEntry.ts';
import { MOUSE_WHEEL_SCROLL_ROWS } from '@constants/ui.ts';
import { handleWheelScroll } from '@components/HomeScreen/wheelScroll.ts';
import {
  bodyEntriesAtom,
  bodyScrollOffsetRowsAtom,
  columnsTestOverrideAtom,
  composerTopAtom,
  rowsTestOverrideAtom
} from '@state/ui/index.ts';
import { composerScrollOffsetRowsAtom, composerStateAtom } from '@state/ui/composer/index.ts';
import { resumePanelOpenAtom } from '@state/ui/resume/index.ts';

type Store = ReturnType<typeof createStore>;

const wheelUp = (row: number, column: number): string => `\u001B[<64;${column};${row}M`;
const wheelDown = (row: number, column: number): string => `\u001B[<65;${column};${row}M`;

// Pointer row 2 (0-based row 1) sits in the transcript body: the composer block
// starts at `rows - 1 - composerRows`, well below it for a 24-row canvas.
const BODY_POINTER_ROW = 2;

/** Seeds a scrollable transcript body: 80 rows against an 18-ish-row viewport. */
function seedScrollableBody(store: Store): void {
  store.set(columnsTestOverrideAtom, 80);
  store.set(rowsTestOverrideAtom, 24);
  store.set(
    bodyEntriesAtom,
    Array.from({ length: 80 }, (_, index) => ({
      kind: BodyEntryKind.Success,
      text: `line ${index}`
    }))
  );
}

describe('handleWheelScroll', () => {
  it('applies every notch of a batched body wheel (proportional scroll)', () => {
    const store = createStore();
    seedScrollableBody(store);
    const notifyScroll = vi.fn();

    const chunk = wheelUp(BODY_POINTER_ROW, 10).repeat(3);
    expect(handleWheelScroll(store, chunk, notifyScroll)).toBe(true);

    expect(store.get(bodyScrollOffsetRowsAtom)).toBe(3 * MOUSE_WHEEL_SCROLL_ROWS);
    expect(notifyScroll).toHaveBeenCalledTimes(1);
  });

  it('nets a mixed up/down batch, applied in order over the body', () => {
    const store = createStore();
    seedScrollableBody(store);

    const chunk =
      wheelUp(BODY_POINTER_ROW, 10) + wheelUp(BODY_POINTER_ROW, 10) + wheelDown(BODY_POINTER_ROW, 10);
    handleWheelScroll(store, chunk, vi.fn());

    // +3, +6, then -3 back to +3.
    expect(store.get(bodyScrollOffsetRowsAtom)).toBe(MOUSE_WHEEL_SCROLL_ROWS);
  });

  it('routes a batched wheel over a scrollable composer to the composer only', () => {
    const store = createStore();
    store.set(columnsTestOverrideAtom, 60);
    store.set(rowsTestOverrideAtom, 24);
    const overflowing = Array.from({ length: 20 }, (_, index) => `line ${index}`).join('\n');
    store.set(composerStateAtom, {
      text: overflowing,
      cursorIndex: overflowing.length,
      validationError: null
    });
    const composerTop = store.get(composerTopAtom);
    // Pointer row `composerTop + 1` (0-based `composerTop`) sits on the composer.
    const chunk = wheelUp(composerTop + 1, 5).repeat(2);

    expect(handleWheelScroll(store, chunk, vi.fn())).toBe(true);
    expect(store.get(composerScrollOffsetRowsAtom)).toBeGreaterThan(0);
    expect(store.get(bodyScrollOffsetRowsAtom)).toBe(0);
  });

  it('scrolls the body on every notch while a docked panel is open', () => {
    const store = createStore();
    seedScrollableBody(store);
    store.set(resumePanelOpenAtom, true);
    const notifyScroll = vi.fn();

    const chunk = wheelUp(BODY_POINTER_ROW, 10).repeat(2);
    expect(handleWheelScroll(store, chunk, notifyScroll)).toBe(true);

    expect(store.get(bodyScrollOffsetRowsAtom)).toBe(2 * MOUSE_WHEEL_SCROLL_ROWS);
    expect(notifyScroll).toHaveBeenCalledTimes(1);
  });

  it('consumes the chunk but does not scroll or notify when every notch is off-canvas', () => {
    const store = createStore();
    seedScrollableBody(store);
    const notifyScroll = vi.fn();

    // Column far past the safe chrome width routes every notch to 'none'.
    const chunk = wheelUp(BODY_POINTER_ROW, 9999).repeat(2);
    expect(handleWheelScroll(store, chunk, notifyScroll)).toBe(true);

    expect(store.get(bodyScrollOffsetRowsAtom)).toBe(0);
    expect(notifyScroll).not.toHaveBeenCalled();
  });

  it('returns false for non-wheel input so the caller keeps handling it', () => {
    const store = createStore();
    seedScrollableBody(store);
    const notifyScroll = vi.fn();

    expect(handleWheelScroll(store, '\u001B[<0;10;2M', notifyScroll)).toBe(false); // left press
    expect(handleWheelScroll(store, 'hello', notifyScroll)).toBe(false);

    expect(notifyScroll).not.toHaveBeenCalled();
    expect(store.get(bodyScrollOffsetRowsAtom)).toBe(0);
  });

  it('applies the wheel notch and drops a co-batched click (wheel wins)', () => {
    const store = createStore();
    seedScrollableBody(store);
    const notifyScroll = vi.fn();

    // A chunk mixing a left-click press with a wheel notch: the wheel path owns
    // it and scrolls; the co-batched click is intentionally dropped.
    const leftPress = '\u001B[<0;10;2M';
    const chunk = leftPress + wheelUp(BODY_POINTER_ROW, 10);
    expect(handleWheelScroll(store, chunk, notifyScroll)).toBe(true);

    expect(store.get(bodyScrollOffsetRowsAtom)).toBe(MOUSE_WHEEL_SCROLL_ROWS);
    expect(notifyScroll).toHaveBeenCalledTimes(1);
  });
});
