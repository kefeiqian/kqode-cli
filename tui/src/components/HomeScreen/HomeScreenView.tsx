import { Box, useInput, useStdout } from 'ink';
import type { createStore } from 'jotai';
import { useAtomValue, useSetAtom, useStore } from 'jotai';
import { useEffect, useRef } from 'react';
import { BodyPane } from '@components/BodyPane.tsx';
import { CwdLine } from '@components/CwdLine.tsx';
import { Header } from '@components/Header.tsx';
import { PromptComposer } from '@components/PromptComposer/index.tsx';
import { ResumePanel } from '@components/ResumePanel/index.tsx';
import { ThemeSurface } from '@components/ThemeSurface/index.tsx';
import { ModelSurface } from '@components/ModelSurface/index.tsx';
import { MemorySurface } from '@components/MemorySurface/index.tsx';
import { ConnectSurface } from '@components/ConnectSurface/index.tsx';
import { SlashCommandMenu } from '@components/SlashCommandMenu/index.tsx';
import { StatusBar } from '@components/StatusBar.tsx';
import {
  DISABLE_SGR_MOUSE_TRACKING,
  ENABLE_SGR_MOUSE_TRACKING,
  parseMouseButtonEvent,
  parseMouseRightClickEvent
} from '@libs/terminal/mouse.ts';
import { handleRightClickPaste } from '@components/HomeScreen/rightClickPaste.ts';
import {
  createSelectionGestureState,
  handleSelectionGesture,
  resolveGestureRegion,
  type GestureRegion
} from '@components/HomeScreen/selectionInput.ts';
import { handleWheelScroll } from '@components/HomeScreen/wheelScroll.ts';
import { useCaretScrollSuppression } from '@components/HomeScreen/useCaretScrollSuppression.ts';
import { resolveClickResult } from '@libs/composer/composerWindow.ts';
import { isInsideSafeChromeBounds } from '@libs/tui/safeCanvas.ts';
import { BODY_CWD_GAP_ROWS } from '@libs/tui/layout.ts';
import {
  bottomSpacerRowsAtom,
  clearBodySelectionAtom,
  composerInputColumnsAtom,
  composerTopAtom,
  layoutAtom,
  safeChromeColumnsAtom,
  scrollBodyByRowsAtom
} from '@state/ui/index.ts';
import { columnsAtom, rowsAtom } from '@state/ui/index.ts';
import { commandMenuOpenAtom } from '@state/ui/commands/index.ts';
import { activeDockedPanelAtom, DockedPanel } from '@state/ui/dock/atoms.ts';
import {
  composerScrollOffsetRowsAtom,
  composerStateAtom,
  setComposerCursorWithOffsetAtom
} from '@state/ui/composer/index.ts';
import { activeThemeAtom } from '@state/global/index.ts';
import {
  COMPOSER_BACKGROUND_TOP_PADDING_ROWS,
  PROMPT_PREFIX
} from '@constants/ui.ts';

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

export function HomeScreenView() {
  const { stdout } = useStdout();
  const columns = useAtomValue(columnsAtom);
  const rows = useAtomValue(rowsAtom);
  const scrollBodyByRows = useSetAtom(scrollBodyByRowsAtom);
  const notifyScroll = useCaretScrollSuppression();
  const store = useStore();
  const theme = useAtomValue(activeThemeAtom);
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

    // A right-click dismisses any active highlight, then pastes — the in-app
    // selection never lingers while the paste runs. Dismissal lives here rather
    // than in useGlobalKeys because the router owns all mouse input.
    if (parseMouseRightClickEvent(input) !== null) {
      store.set(clearBodySelectionAtom);
      handleRightClickPaste(input, store);
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

  return (
    <Box
      flexDirection="column"
      width={columns}
      height={rows}
      backgroundColor={theme.colors.bodyBackground}
    >
      <HomeHeader />
      <HomeBody />
      <HomeBottomStack />
      <HomeComposer />
      <HomeStatusBar />
    </Box>
  );
}

function HomeHeader() {
  return <Header />;
}

function HomeBody() {
  const layout = useAtomValue(layoutAtom);
  const theme = useAtomValue(activeThemeAtom);

  return (
    <Box
      height={layout.bodyRows}
      flexDirection="column"
      backgroundColor={theme.colors.bodyBackground}
    >
      <BodyPane rows={layout.bodyRows} />
    </Box>
  );
}

function HomeBottomStack() {
  const bottomSpacerRows = useAtomValue(bottomSpacerRowsAtom);
  const menuOpen = useAtomValue(commandMenuOpenAtom);
  const dockedPanel = useAtomValue(activeDockedPanelAtom);

  if (dockedPanel !== null) {
    return (
      <Box marginTop={bottomSpacerRows} flexDirection="column">
        <DockedSurface panel={dockedPanel} />
      </Box>
    );
  }

  // The cwd line and the command palette share the row directly above the
  // composer: the palette replaces the cwd while it is open. The spacer + gap
  // margin sits on this wrapper so the cwd/menu block, composer, and status row
  // stay pinned to the bottom whether or not the cwd is shown.
  return (
    <Box marginTop={bottomSpacerRows + BODY_CWD_GAP_ROWS} flexDirection="column">
      {menuOpen ? null : <CwdLine />}
      <SlashCommandMenu />
    </Box>
  );
}

/** Renders the one open docked popup below the accent divider it owns. */
function DockedSurface({ panel }: { panel: DockedPanel }) {
  switch (panel) {
    case DockedPanel.Resume:
      return <ResumePanel />;
    case DockedPanel.Theme:
      return <ThemeSurface />;
    case DockedPanel.Model:
      return <ModelSurface />;
    case DockedPanel.Memory:
      return <MemorySurface />;
    case DockedPanel.Connect:
      return <ConnectSurface />;
    default:
      return null;
  }
}

function HomeComposer() {
  const docked = useAtomValue(activeDockedPanelAtom) !== null;
  if (docked) {
    return null;
  }

  return <PromptComposer />;
}

function HomeStatusBar() {
  const docked = useAtomValue(activeDockedPanelAtom) !== null;
  if (docked) {
    return null;
  }

  return <StatusBar />;
}
