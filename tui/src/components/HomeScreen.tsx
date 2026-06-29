import { Box, useInput, useStdout } from 'ink';
import { useEffect, useState } from 'react';
import { BodyPane } from '@components/BodyPane.js';
import type { BodyBackgroundMode, BodyEntry } from '@components/bodyRows.js';
import { countBodyRows, DEFAULT_BODY_ENTRIES } from '@components/BodyPane.js';
import { CwdLine } from '@components/CwdLine.js';
import { Header } from '@components/Header.js';
import { DEFAULT_COLUMNS, DEFAULT_ROWS, headerRowCount } from '@components/layout.js';
import type { BackgroundBlockMode } from '@components/BackgroundBlock.js';
import { PromptComposer } from '@components/PromptComposer.js';
import { StatusBar } from '@components/StatusBar.js';
import {
  DISABLE_SGR_MOUSE_TRACKING,
  ENABLE_SGR_MOUSE_TRACKING,
  parseMouseWheelInput
} from '@libs/terminal/mouse.js';

export type HomeScreenProps = {
  productVersion: string;
  workspaceCwd: string;
  gitStatusLabel?: string;
  modelLabel?: string;
  bodyEntries?: readonly BodyEntry[];
  columns?: number;
  composerBackgroundMode?: BackgroundBlockMode;
  messageBackgroundMode?: BodyBackgroundMode;
  rows?: number;
  onPromptSubmit?: (prompt: string) => void;
};

const DEFAULT_MODEL_LABEL = 'GPT-5.5';
const BODY_CWD_GAP_ROWS = 1;
const COMPOSER_ERROR_RESERVE_ROWS = 1;
const DEFAULT_COMPOSER_ROWS = 1;
const MOUSE_WHEEL_SCROLL_ROWS = 3;

export function HomeScreen({
  productVersion,
  workspaceCwd,
  gitStatusLabel,
  modelLabel = DEFAULT_MODEL_LABEL,
  bodyEntries,
  columns = DEFAULT_COLUMNS,
  composerBackgroundMode = 'enabled',
  messageBackgroundMode = 'disabled',
  rows = DEFAULT_ROWS,
  onPromptSubmit = () => {}
}: HomeScreenProps) {
  const { stdout } = useStdout();
  const [bodyScrollOffsetRows, setBodyScrollOffsetRows] = useState(0);
  const [composerRows, setComposerRows] = useState(DEFAULT_COMPOSER_ROWS);
  const [submittedPromptEntries, setSubmittedPromptEntries] = useState<BodyEntry[]>([]);
  const baseBodyEntries = bodyEntries ?? DEFAULT_BODY_ENTRIES;
  const displayedBodyEntries =
    submittedPromptEntries.length === 0
      ? bodyEntries
      : [...baseBodyEntries, ...submittedPromptEntries];
  const bodyEntryRows = countBodyRows(
    displayedBodyEntries ?? DEFAULT_BODY_ENTRIES,
    columns,
    rows,
    messageBackgroundMode
  );
  const layout = resolveHomeScreenLayout(columns, rows, bodyEntryRows, composerRows);
  const bodyRowsForScroll = countBodyRows(
    displayedBodyEntries ?? DEFAULT_BODY_ENTRIES,
    columns,
    layout.bodyRows,
    messageBackgroundMode
  );
  const maxBodyScrollOffsetRows = Math.max(
    0,
    bodyRowsForScroll - layout.bodyRows
  );
  const bodyScrollPageRows = Math.max(1, layout.bodyRows - 2);
  const bottomSpacerRows = Math.max(
    0,
    rows -
      headerRowCount(columns) -
      layout.bodyRows -
      BODY_CWD_GAP_ROWS -
      1 -
      composerRows -
      1
  );
  const composerTop = rows - 1 - composerRows;

  useEffect(() => {
    if (!stdout.isTTY) {
      return;
    }

    stdout.write(ENABLE_SGR_MOUSE_TRACKING);
    return () => {
      stdout.write(DISABLE_SGR_MOUSE_TRACKING);
    };
  }, [stdout]);

  const handlePromptSubmit = (prompt: string) => {
    setSubmittedPromptEntries((current) => [...current, { kind: 'prompt', text: prompt }]);
    setBodyScrollOffsetRows(0);
    onPromptSubmit(prompt);
  };

  const scrollBodyByRows = (deltaRows: number) => {
    setBodyScrollOffsetRows((current) =>
      Math.min(maxBodyScrollOffsetRows, Math.max(0, current + deltaRows))
    );
  };

  useInput((input, key) => {
    const wheelDirection = parseMouseWheelInput(input);
    if (wheelDirection !== null) {
      scrollBodyByRows(
        wheelDirection === 'up' ? MOUSE_WHEEL_SCROLL_ROWS : -MOUSE_WHEEL_SCROLL_ROWS
      );
      return;
    }

    if (key.pageUp) {
      scrollBodyByRows(bodyScrollPageRows);
      return;
    }

    if (key.pageDown) {
      scrollBodyByRows(-bodyScrollPageRows);
      return;
    }

    if (key.end) {
      setBodyScrollOffsetRows(0);
    }
  });

  return (
    <Box flexDirection="column" width={columns} height={rows}>
      <Header productVersion={productVersion} columns={columns} />
      <Box height={layout.bodyRows} flexDirection="column">
        <BodyPane
          entries={displayedBodyEntries}
          rows={layout.bodyRows}
          columns={columns}
          scrollOffsetRows={bodyScrollOffsetRows}
          backgroundMode={messageBackgroundMode}
        />
      </Box>
      <Box marginTop={bottomSpacerRows + BODY_CWD_GAP_ROWS}>
        <CwdLine workspaceCwd={workspaceCwd} gitStatusLabel={gitStatusLabel} columns={columns} />
      </Box>
      <PromptComposer
        columns={columns}
        cursorTop={composerTop}
        backgroundMode={composerBackgroundMode}
        maxVisibleLines={layout.composerVisibleRows}
        onSubmit={handlePromptSubmit}
        onVisibleRowsChange={setComposerRows}
      />
      <StatusBar columns={columns} modelLabel={modelLabel} />
    </Box>
  );
}

export function resolveHomeScreenLayout(
  columns: number,
  rows: number,
  bodyEntryCount = Number.POSITIVE_INFINITY,
  composerRows = DEFAULT_COMPOSER_ROWS
): { bodyRows: number; composerVisibleRows: number } {
  const headerRows = headerRowCount(columns);
  const cwdRows = 1;
  const statusRows = 1;
  const composerErrorReserveRows = COMPOSER_ERROR_RESERVE_ROWS;
  const minBodyRows = 1;
  const fixedRows = headerRows + BODY_CWD_GAP_ROWS + cwdRows + statusRows;
  const maxComposerVisibleRows = Math.max(
    1,
    rows - fixedRows - composerErrorReserveRows - minBodyRows
  );
  const maxBodyRows = rows - fixedRows - composerRows;

  return {
    bodyRows: Math.max(1, Math.min(maxBodyRows, bodyEntryCount + 1)),
    composerVisibleRows: maxComposerVisibleRows
  };
}
