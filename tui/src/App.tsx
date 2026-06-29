import { useWindowSize } from 'ink';
import { DEFAULT_COLUMNS, DEFAULT_ROWS, MIN_ROWS } from '@components/layout.js';
import { HomeScreen } from '@components/HomeScreen.js';
import type { HomeScreenProps } from '@components/HomeScreen.js';

type AppProps = HomeScreenProps;

export function App({
  productVersion,
  workspaceCwd,
  gitStatusLabel,
  modelLabel,
  bodyEntries,
  columns,
  composerBackgroundMode,
  messageBackgroundMode,
  rows,
  onPromptSubmit
}: AppProps) {
  const windowSize = useWindowSize();
  const resolvedColumns = columns ?? windowSize.columns ?? DEFAULT_COLUMNS;
  const resolvedRows = Math.max(MIN_ROWS, rows ?? windowSize.rows ?? DEFAULT_ROWS);

  return (
    <HomeScreen
      productVersion={productVersion}
      workspaceCwd={workspaceCwd}
      gitStatusLabel={gitStatusLabel}
      modelLabel={modelLabel}
      bodyEntries={bodyEntries}
      columns={resolvedColumns}
      composerBackgroundMode={composerBackgroundMode}
      messageBackgroundMode={messageBackgroundMode}
      rows={resolvedRows}
      onPromptSubmit={onPromptSubmit}
    />
  );
}
