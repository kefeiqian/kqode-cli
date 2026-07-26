import { useInput, useStdout } from 'ink';
import { createStore, useAtomValue, useSetAtom, useStore } from 'jotai';
import { useEffect, useRef } from 'react';
import { handleRightClick } from '@hooks/homeScreen/selectionClipboard.ts';
import {
  handleSelectionGesture,
  resolveGestureRegion,
  type GestureRegion
} from '@hooks/homeScreen/selectionInput.ts';
import { handleWheelScroll } from '@hooks/homeScreen/handleWheelScroll.ts';
import { useComposerCaretRefresh } from '@hooks/homeScreen/useComposerCaretRefresh.ts';
import { usePullRequestClick } from '@hooks/homeScreen/usePullRequestClick.ts';
import { resolveClickResult } from '@libs/composer/composerWindow.ts';
import { resolveComposerInputColumns } from '@libs/composer/layout.ts';
import { PROMPT_MAX_BYTES } from '@libs/composer/promptText.ts';
import {
  DISABLE_SGR_MOUSE_TRACKING,
  ENABLE_SGR_MOUSE_TRACKING,
  parseMouseInputEvents,
  type MouseClickEvent
} from '@libs/terminal/mouse.ts';
import {
  clearBodySelectionAtom,
  chromeColumnsAtom,
  columnsAtom,
  composerTopAtom,
  displayedBodyEntriesAtom,
  layoutAtom,
  scrollBodyByRowsAtom
} from '@state/ui/index.ts';
import {
  composerScrollOffsetRowsAtom,
  composerStateAtom,
  setComposerCursorWithOffsetAtom
} from '@state/ui/composer/index.ts';
import {
  COMPOSER_BACKGROUND_TOP_PADDING_ROWS,
  PROMPT_PREFIX
} from '@constants/ui.ts';

type Store = ReturnType<typeof createStore>;

/** Wires home-screen mouse gestures and transcript scroll keys. */
export function useHomeScreenInput(): void {
  const { stdout } = useStdout();
  const scrollBodyByRows = useSetAtom(scrollBodyByRowsAtom);
  const notifyScroll = useComposerCaretRefresh();
  const handlePullRequestClick = usePullRequestClick();
  const store = useStore();
  const columns = useAtomValue(columnsAtom);
  const bodyRows = useAtomValue(layoutAtom).bodyRows;
  const bodyEntries = useAtomValue(displayedBodyEntriesAtom);
  const gestureRegionRef = useRef<GestureRegion | null>(null);
  const selectionGeometryRef = useRef({ bodyEntries, bodyRows, columns });

  useEffect(() => {
    if (!stdout.isTTY) {
      return;
    }

    stdout.write(ENABLE_SGR_MOUSE_TRACKING);
    return () => {
      stdout.write(DISABLE_SGR_MOUSE_TRACKING);
    };
  }, [stdout]);

  useEffect(() => {
    const previous = selectionGeometryRef.current;
    if (
      previous.bodyEntries !== bodyEntries ||
      previous.bodyRows !== bodyRows ||
      previous.columns !== columns
    ) {
      store.set(clearBodySelectionAtom);
      gestureRegionRef.current = null;
      selectionGeometryRef.current = { bodyEntries, bodyRows, columns };
    }
  }, [bodyEntries, bodyRows, columns, store]);

  useEffect(
    () => () => {
      store.set(clearBodySelectionAtom);
      gestureRegionRef.current = null;
    },
    [store]
  );

  useInput((input, key) => {
    const mouseEvents = parseMouseInputEvents(input);
    if (mouseEvents !== null) {
      let scrollNotified = false;
      for (const event of mouseEvents) {
        if (event.kind === 'wheel') {
          handleWheelScroll(store, [event], () => {
            if (!scrollNotified) {
              scrollNotified = true;
              notifyScroll();
            }
          });
          continue;
        }

        if (event.kind === 'rightClick') {
          handleRightClick(store, PROMPT_MAX_BYTES);
          continue;
        }

        if (event.kind === 'press') {
          if (handlePullRequestClick(event)) {
            gestureRegionRef.current = null;
            continue;
          }

          const region = resolveGestureRegion(store, event.row);
          gestureRegionRef.current = region;
          if (region === 'body') {
            if (!handleSelectionGesture(store, event)) {
              gestureRegionRef.current = null;
            }
          } else if (region === 'composer') {
            positionComposerCaret(store, event);
          }
          continue;
        }

        if (gestureRegionRef.current === 'body') {
          handleSelectionGesture(store, event);
        }
        if (event.kind === 'release') {
          gestureRegionRef.current = null;
        }
      }
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

function positionComposerCaret(
  store: Store,
  point: MouseClickEvent
): void {
  const composerState = store.get(composerStateAtom);
  const result = resolveClickResult({
    text: composerState.text,
    columns: resolveComposerInputColumns(store.get(chromeColumnsAtom)),
    maxVisibleLines: store.get(layoutAtom).composerVisibleRows,
    cursorIndex: composerState.cursorIndex,
    offset: store.get(composerScrollOffsetRowsAtom),
    visibleRow:
      point.row -
      1 -
      (store.get(composerTopAtom) + COMPOSER_BACKGROUND_TOP_PADDING_ROWS),
    column: point.column - 1 - PROMPT_PREFIX.length
  });
  if (result !== null) {
    store.set(setComposerCursorWithOffsetAtom, result);
  }
}
