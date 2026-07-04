import { Box, useInput, useStdout } from 'ink';
import { useAtomValue, useSetAtom } from 'jotai';
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
  parseMouseWheelInput
} from '@libs/terminal/mouse.ts';
import { BODY_CWD_GAP_ROWS } from '@libs/tui/layout.ts';
import {
  bottomSpacerRowsAtom,
  layoutAtom,
  scrollBodyByRowsAtom
} from '@state/ui/index.ts';
import { columnsAtom, rowsAtom } from '@state/ui/index.ts';
import { commandMenuOpenAtom } from '@state/ui/commands/index.ts';
import { theme } from '@theme/themeConfig.ts';
import { MOUSE_WHEEL_SCROLL_ROWS } from '@constants/ui.ts';

export function HomeScreenView() {
  const { stdout } = useStdout();
  const columns = useAtomValue(columnsAtom);
  const rows = useAtomValue(rowsAtom);
  const layout = useAtomValue(layoutAtom);
  const scrollBodyByRows = useSetAtom(scrollBodyByRowsAtom);

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
    const wheelDirection = parseMouseWheelInput(input);
    if (wheelDirection !== null) {
      scrollBodyByRows(
        wheelDirection === 'up' ? MOUSE_WHEEL_SCROLL_ROWS : -MOUSE_WHEEL_SCROLL_ROWS
      );
      return;
    }

    if (key.pageUp) {
      scrollBodyByRows(Math.max(1, layout.bodyRows - 2));
      return;
    }

    if (key.pageDown) {
      scrollBodyByRows(-Math.max(1, layout.bodyRows - 2));
      return;
    }

    if (key.end) {
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
