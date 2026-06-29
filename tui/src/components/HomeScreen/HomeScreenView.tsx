import { Box, useInput, useStdout } from 'ink';
import { useAtomValue, useSetAtom } from 'jotai';
import { useEffect } from 'react';
import { BodyPane } from '@components/BodyPane.js';
import { CwdLine } from '@components/CwdLine.js';
import { Header } from '@components/Header.js';
import { PromptComposer } from '@components/PromptComposer.js';
import { StatusBar } from '@components/StatusBar.js';
import {
  DISABLE_SGR_MOUSE_TRACKING,
  ENABLE_SGR_MOUSE_TRACKING,
  parseMouseWheelInput
} from '@libs/terminal/mouse.js';
import {
  BODY_CWD_GAP_ROWS,
  bodyScrollOffsetRowsAtom,
  bottomSpacerRowsAtom,
  composerRowsAtom,
  composerTopAtom,
  displayedBodyEntriesAtom,
  homeScreenConfigAtom,
  layoutAtom,
  scrollBodyByRowsAtom,
  submitPromptAtom
} from '@state/homeScreenAtoms.js';
import { geminiDarkTheme } from '@theme/themeConfig.js';

const MOUSE_WHEEL_SCROLL_ROWS = 3;

export function HomeScreenView() {
  const { stdout } = useStdout();
  const config = useAtomValue(homeScreenConfigAtom);
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
      width={config.columns}
      height={config.rows}
      backgroundColor={geminiDarkTheme.colors.bodyBackground}
    >
      <HomeHeader />
      <HomeBody />
      <HomeCwd />
      <HomeComposer />
      <HomeStatus />
    </Box>
  );
}

function HomeHeader() {
  const { columns, productVersion } = useAtomValue(homeScreenConfigAtom);
  return <Header productVersion={productVersion} columns={columns} />;
}

function HomeBody() {
  const config = useAtomValue(homeScreenConfigAtom);
  const layout = useAtomValue(layoutAtom);
  const bodyScrollOffsetRows = useAtomValue(bodyScrollOffsetRowsAtom);
  const displayedBodyEntries = useAtomValue(displayedBodyEntriesAtom);

  return (
    <Box
      height={layout.bodyRows}
      flexDirection="column"
      backgroundColor={geminiDarkTheme.colors.bodyBackground}
    >
      <BodyPane
        entries={displayedBodyEntries}
        rows={layout.bodyRows}
        columns={config.columns}
        scrollOffsetRows={bodyScrollOffsetRows}
      />
    </Box>
  );
}

function HomeCwd() {
  const { columns, gitStatusLabel, workspaceCwd } = useAtomValue(homeScreenConfigAtom);
  const bottomSpacerRows = useAtomValue(bottomSpacerRowsAtom);

  return (
    <Box marginTop={bottomSpacerRows + BODY_CWD_GAP_ROWS}>
      <CwdLine workspaceCwd={workspaceCwd} gitStatusLabel={gitStatusLabel} columns={columns} />
    </Box>
  );
}

function HomeComposer() {
  const { columns } = useAtomValue(homeScreenConfigAtom);
  const layout = useAtomValue(layoutAtom);
  const composerTop = useAtomValue(composerTopAtom);
  const setComposerRows = useSetAtom(composerRowsAtom);
  const submitPrompt = useSetAtom(submitPromptAtom);

  return (
    <PromptComposer
      columns={columns}
      cursorTop={composerTop}
      maxVisibleLines={layout.composerVisibleRows}
      onSubmit={submitPrompt}
      onVisibleRowsChange={setComposerRows}
    />
  );
}

function HomeStatus() {
  const { columns, modelLabel } = useAtomValue(homeScreenConfigAtom);
  return <StatusBar columns={columns} modelLabel={modelLabel} />;
}
