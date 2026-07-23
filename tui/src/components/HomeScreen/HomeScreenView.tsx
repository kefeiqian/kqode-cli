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
  parseMouseInputEvents
} from '@libs/terminal/mouse.ts';
import { handleWheelScroll } from '@hooks/homeScreen/handleWheelScroll.ts';
import { useComposerCaretRefresh } from '@hooks/homeScreen/useComposerCaretRefresh.ts';
import { usePullRequestClick } from '@hooks/homeScreen/usePullRequestClick.ts';
import { resolveClickResult } from '@libs/composer/composerWindow.ts';
import { BODY_CWD_GAP_ROWS } from '@libs/tui/layout.ts';
import {
  bottomSpacerRowsAtom,
  chromeColumnsAtom,
  composerTopAtom,
  layoutAtom,
  scrollBodyByRowsAtom
} from '@state/ui/index.ts';
import { columnsAtom, rowsAtom } from '@state/ui/index.ts';
import { commandMenuOpenAtom } from '@state/ui/commands/index.ts';
import {
  composerScrollOffsetRowsAtom,
  composerStateAtom,
  setComposerCursorWithOffsetAtom
} from '@state/ui/composer/index.ts';
import { theme } from '@theme/themeConfig.ts';
import {
  COMPOSER_BACKGROUND_TOP_PADDING_ROWS,
  PROMPT_PREFIX
} from '@constants/ui.ts';

export function HomeScreenView() {
  const { stdout } = useStdout();
  const columns = useAtomValue(columnsAtom);
  const chromeColumns = useAtomValue(chromeColumnsAtom);
  const rows = useAtomValue(rowsAtom);
  const layout = useAtomValue(layoutAtom);
  const composerTop = useAtomValue(composerTopAtom);
  const scrollBodyByRows = useSetAtom(scrollBodyByRowsAtom);
  const notifyScroll = useComposerCaretRefresh();
  const handlePullRequestClick = usePullRequestClick();
  const store = useStore();

  useEffect(() => {
    if (!stdout.isTTY) {
      return;
    }

    stdout.write(ENABLE_SGR_MOUSE_TRACKING);
    return () => {
      stdout.write(DISABLE_SGR_MOUSE_TRACKING);
    };
  }, [stdout]);

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
        if (handlePullRequestClick(event)) {
          continue;
        }
        // Text rows start below the top half-line cap. Resolve each press in
        // source order so a batched release or later click is never inserted.
        const composerState = store.get(composerStateAtom);
        const result = resolveClickResult({
          text: composerState.text,
          columns: Math.max(1, chromeColumns - PROMPT_PREFIX.length),
          maxVisibleLines: layout.composerVisibleRows,
          cursorIndex: composerState.cursorIndex,
          offset: store.get(composerScrollOffsetRowsAtom),
          visibleRow: event.row - 1 - (composerTop + COMPOSER_BACKGROUND_TOP_PADDING_ROWS),
          column: event.column - 1 - PROMPT_PREFIX.length
        });
        if (result !== null) {
          store.set(setComposerCursorWithOffsetAtom, result);
        }
      }
      return;
    }

    if (key.pageUp) {
      notifyScroll();
      scrollBodyByRows(Math.max(1, layout.bodyRows - 2));
      return;
    }

    if (key.pageDown) {
      notifyScroll();
      scrollBodyByRows(-Math.max(1, layout.bodyRows - 2));
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
