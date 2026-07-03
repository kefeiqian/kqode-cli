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
import {
  BODY_CWD_GAP_ROWS,
  bottomSpacerRowsAtom,
  layoutAtom,
  scrollBodyByRowsAtom
} from '@state/homeScreen/index.ts';
import { columnsAtom, rowsAtom } from '@state/global/index.ts';
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
      <HomeCwd />
      <SlashCommandMenu />
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

function HomeCwd() {
  const bottomSpacerRows = useAtomValue(bottomSpacerRowsAtom);

  return (
    <Box marginTop={bottomSpacerRows + BODY_CWD_GAP_ROWS}>
      <CwdLine />
    </Box>
  );
}

function HomeComposer() {
  return <PromptComposer />;
}
