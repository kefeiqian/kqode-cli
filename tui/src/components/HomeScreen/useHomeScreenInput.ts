import { useInput, useStdout } from 'ink';
import type { createStore } from 'jotai';
import { useSetAtom, useStore } from 'jotai';
import { useEffect, useRef } from 'react';
import {
  DISABLE_SGR_MOUSE_TRACKING,
  ENABLE_SGR_MOUSE_TRACKING,
  parseMouseButtonEvent,
  parseMouseRightClickEvent
} from '@libs/terminal/mouse.ts';
import { copySelection } from '@components/HomeScreen/copySelection.ts';
import {
  createSelectionGestureState,
  handleSelectionGesture,
  resolveGestureRegion,
  type GestureRegion
} from '@components/HomeScreen/selectionInput.ts';
import { handleWheelScroll } from '@components/HomeScreen/wheelScroll.ts';
import { useComposerCaretRefresh } from '@components/HomeScreen/useComposerCaretRefresh.ts';
import { resolveClickResult } from '@libs/composer/composerWindow.ts';
import { isInsideSafeChromeBounds } from '@libs/tui/safeCanvas.ts';
import {
  clearBodySelectionAtom,
  composerInputColumnsAtom,
  composerTopAtom,
  layoutAtom,
  markRightClickPasteSuppressionAtom,
  rowsAtom,
  safeChromeColumnsAtom,
  scrollBodyByRowsAtom
} from '@state/ui/index.ts';
import {
  composerScrollOffsetRowsAtom,
  composerStateAtom,
  setComposerCursorWithOffsetAtom
} from '@state/ui/composer/index.ts';
import { COMPOSER_BACKGROUND_TOP_PADDING_ROWS, PROMPT_PREFIX } from '@constants/ui.ts';

type Store = ReturnType<typeof createStore>;

/** Wall clock for multi-click classification, injected so tests can fake it. */
const nowMs = (): number => Date.now();

/**
 * Positions the composer caret from a left press at 1-based SGR `row`/`column`.
 * The caller guarantees the press landed in the composer region; this still
 * clamps to the safe chrome bounds and lets `resolveClickResult` reject columns
 * past the text. Text rows start one row below `composerTop` (the top half-line
 * cap) and the prompt prefix offsets columns.
 */
function positionComposerCaret(store: Store, point: { row: number; column: number }): void {
  const rows = store.get(rowsAtom);
  const safeChromeColumns = store.get(safeChromeColumnsAtom);
  if (
    !isInsideSafeChromeBounds({
      row: point.row,
      column: point.column,
      rows,
      columns: safeChromeColumns
    })
  ) {
    return;
  }

  const composerTop = store.get(composerTopAtom);
  const composerState = store.get(composerStateAtom);
  const result = resolveClickResult({
    text: composerState.text,
    columns: store.get(composerInputColumnsAtom),
    maxVisibleLines: store.get(layoutAtom).composerVisibleRows,
    cursorIndex: composerState.cursorIndex,
    offset: store.get(composerScrollOffsetRowsAtom),
    visibleRow: point.row - 1 - (composerTop + COMPOSER_BACKGROUND_TOP_PADDING_ROWS),
    column: point.column - 1 - PROMPT_PREFIX.length
  });
  if (result !== null) {
    store.set(setComposerCursorWithOffsetAtom, result);
  }
}

/**
 * Wires the home screen's terminal input. Enables SGR mouse tracking for the
 * whole session and routes every mouse/key event: a left press/drag/release
 * drives in-app transcript selection or the composer caret (latched to the
 * region the press began in), wheel notches scroll the pane under the pointer,
 * a right-click copies the active selection, and Page Up/Down/End scroll the
 * body. Extracted from `HomeScreenView` so the component stays layout-only.
 */
export function useHomeScreenInput(): void {
  const { stdout } = useStdout();
  const scrollBodyByRows = useSetAtom(scrollBodyByRowsAtom);
  const notifyScroll = useComposerCaretRefresh();
  const store = useStore();
  // Latches the region a left press started in so drag/release events stay with
  // that gesture regardless of where the pointer wanders (see resolveGestureRegion).
  const gestureRegionRef = useRef<GestureRegion | null>(null);
  // Multi-click classification + word/line lock state, persisted across gestures.
  const gestureStateRef = useRef(createSelectionGestureState());

  useEffect(() => {
    if (!stdout.isTTY) {
      return;
    }

    // Mouse tracking stays enabled for the whole session: selection mode now
    // owns the mouse in-app (drag to select, release to copy) instead of
    // releasing it to the terminal, so entering the mode no longer disables it.
    stdout.write(ENABLE_SGR_MOUSE_TRACKING);
    return () => {
      stdout.write(DISABLE_SGR_MOUSE_TRACKING);
    };
  }, [stdout]);

  useInput((input, key) => {
    // A left press/drag/release drives either the in-app transcript selection or
    // the composer caret, decided by the region the press started in — no mode
    // toggle. The owning region is latched at press time so a drag that wanders
    // between regions keeps routing to the gesture that began.
    const gesture = parseMouseButtonEvent(input);
    if (gesture !== null) {
      const multiClick = { state: gestureStateRef.current, now: nowMs };
      if (gesture.kind === 'press') {
        const region = resolveGestureRegion(store, gesture.row);
        gestureRegionRef.current = region;
        if (region === 'body') {
          handleSelectionGesture(store, gesture, multiClick);
        } else if (region === 'composer') {
          positionComposerCaret(store, gesture);
        }
        return;
      }

      // Drags and the release route to whichever region owned the press: a body
      // drag keeps selecting even over the composer, and a composer press never
      // becomes a selection.
      if (gestureRegionRef.current === 'body') {
        handleSelectionGesture(store, gesture, multiClick);
      }
      if (gesture.kind === 'release') {
        gestureRegionRef.current = null;
      }
      return;
    }

    if (handleWheelScroll(store, input, notifyScroll)) {
      return;
    }

    // A right-click copies any active selection to the clipboard, then dismisses
    // the highlight — copying is manual (a drag only highlights). Copy before the
    // clear so the selection is still readable, and dismissal lives here rather
    // than in useGlobalKeys because the router owns all mouse input. Some
    // terminals also emit a native paste after right-click; suppress only that
    // immediate bracketed-paste fallout so right-click never pastes into composer.
    if (parseMouseRightClickEvent(input) !== null) {
      store.set(markRightClickPasteSuppressionAtom);
      copySelection(store);
      store.set(clearBodySelectionAtom);
      return;
    }

    if (key.pageUp) {
      notifyScroll();
      scrollBodyByRows(Math.max(1, store.get(layoutAtom).bodyRows - 2));
      return;
    }

    if (key.pageDown) {
      notifyScroll();
      scrollBodyByRows(-Math.max(1, store.get(layoutAtom).bodyRows - 2));
      return;
    }

    if (key.end) {
      notifyScroll();
      scrollBodyByRows(Number.NEGATIVE_INFINITY);
    }
  });
}
