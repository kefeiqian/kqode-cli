import { Box, useInput, useStdout } from 'ink';
import { useAtomValue, useSetAtom, useStore } from 'jotai';
import { useEffect } from 'react';
import { BodyPane } from '@components/BodyPane.tsx';
import { CwdLine } from '@components/CwdLine.tsx';
import { Header } from '@components/Header.tsx';
import { PromptComposer } from '@components/PromptComposer/index.tsx';
import { SlashCommandMenu } from '@components/SlashCommandMenu/index.tsx';
import { StatusBar } from '@components/StatusBar.tsx';
import {
  DISABLE_SGR_MOUSE_TRACKING,
  ENABLE_SGR_MOUSE_TRACKING,
  parseMouseClickEvent,
  parseMouseWheelEvent
} from '@libs/terminal/mouse.ts';
import { handleRightClickPaste } from '@components/HomeScreen/rightClickPaste.ts';
import { resolveWheelTarget } from '@components/HomeScreen/wheelRouting.ts';
import { useCaretScrollSuppression } from '@components/HomeScreen/useCaretScrollSuppression.ts';
import { resolveClickResult } from '@libs/composer/composerWindow.ts';
import { isInsideSafeChromeBounds } from '@libs/tui/safeCanvas.ts';
import { BODY_CWD_GAP_ROWS } from '@libs/tui/layout.ts';
import {
  bottomSpacerRowsAtom,
  composerInputColumnsAtom,
  composerCanScrollAtom,
  composerTopAtom,
  layoutAtom,
  safeChromeColumnsAtom,
  scrollBodyByRowsAtom,
  scrollComposerByRowsAtom
} from '@state/ui/index.ts';
import { columnsAtom, copyModeActiveAtom, rowsAtom } from '@state/ui/index.ts';
import { commandMenuOpenAtom } from '@state/ui/commands/index.ts';
import {
  composerScrollOffsetRowsAtom,
  composerStateAtom,
  setComposerCursorWithOffsetAtom
} from '@state/ui/composer/index.ts';
import { theme } from '@theme/themeConfig.ts';
import {
  COMPOSER_BACKGROUND_TOP_PADDING_ROWS,
  MOUSE_WHEEL_SCROLL_ROWS,
  PROMPT_PREFIX
} from '@constants/ui.ts';

export function HomeScreenView() {
  const { stdout } = useStdout();
  const columns = useAtomValue(columnsAtom);
  const rows = useAtomValue(rowsAtom);
  const copyModeActive = useAtomValue(copyModeActiveAtom);
  const scrollBodyByRows = useSetAtom(scrollBodyByRowsAtom);
  const scrollComposerByRows = useSetAtom(scrollComposerByRowsAtom);
  const notifyScroll = useCaretScrollSuppression();
  const store = useStore();

  useEffect(() => {
    if (!stdout.isTTY) {
      return;
    }

    stdout.write(copyModeActive ? DISABLE_SGR_MOUSE_TRACKING : ENABLE_SGR_MOUSE_TRACKING);
    return () => {
      stdout.write(DISABLE_SGR_MOUSE_TRACKING);
    };
  }, [copyModeActive, stdout]);

  useInput((input, key) => {
    if (copyModeActive && !key.pageUp && !key.pageDown && !key.end) {
      return;
    }

    const wheel = parseMouseWheelEvent(input);
    if (wheel !== null) {
      const currentRows = store.get(rowsAtom);
      const currentSafeChromeColumns = store.get(safeChromeColumnsAtom);
      const target = resolveWheelTarget({
        mouseRow: wheel.row,
        mouseColumn: wheel.column,
        composerTop: store.get(composerTopAtom),
        rows: currentRows,
        columns: currentSafeChromeColumns,
        composerCanScroll: store.get(composerCanScrollAtom)
      });
      if (target === 'none') {
        return;
      }
      notifyScroll();
      if (target === 'composer') {
        // A body-sized notch is near-full-page in a small composer; clamp it.
        const step = Math.max(1, Math.min(MOUSE_WHEEL_SCROLL_ROWS, store.get(layoutAtom).composerVisibleRows - 1));
        scrollComposerByRows(wheel.direction === 'up' ? step : -step);
      } else {
        scrollBodyByRows(
          wheel.direction === 'up' ? MOUSE_WHEEL_SCROLL_ROWS : -MOUSE_WHEEL_SCROLL_ROWS
        );
      }
      return;
    }

    const click = parseMouseClickEvent(input);
    if (click !== null) {
      const currentRows = store.get(rowsAtom);
      const currentSafeChromeColumns = store.get(safeChromeColumnsAtom);
      const currentComposerTop = store.get(composerTopAtom);
      if (!isInsideSafeChromeBounds({ row: click.row, column: click.column, rows: currentRows, columns: currentSafeChromeColumns })) {
        return;
      }
      // Map the click to a cursor index + the scroll offset that keeps the
      // visible window fixed (clicking repositions the caret without scrolling).
      // Text rows start one row below composerTop (the top half-line cap); the
      // prompt prefix offsets columns.
      const composerState = store.get(composerStateAtom);
      const result = resolveClickResult({
        text: composerState.text,
        columns: store.get(composerInputColumnsAtom),
        maxVisibleLines: store.get(layoutAtom).composerVisibleRows,
        cursorIndex: composerState.cursorIndex,
        offset: store.get(composerScrollOffsetRowsAtom),
        visibleRow: click.row - 1 - (currentComposerTop + COMPOSER_BACKGROUND_TOP_PADDING_ROWS),
        column: click.column - 1 - PROMPT_PREFIX.length
      });
      if (result !== null) {
        store.set(setComposerCursorWithOffsetAtom, result);
      }
      return;
    }

    if (handleRightClickPaste(input, store)) {
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
      <StatusBar />
    </Box>
  );
}

function HomeHeader() {
  return <Header />;
}

function HomeBody() {
  const layout = useAtomValue(layoutAtom);

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

function HomeComposer() {
  return <PromptComposer />;
}
