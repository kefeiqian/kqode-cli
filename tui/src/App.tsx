import { useWindowSize } from 'ink';
import { HomeScreen } from '@components/HomeScreen/index.js';
import { DEFAULT_COLUMNS, DEFAULT_ROWS, MIN_ROWS } from '@libs/tui/layout.js';
import { createHomeScreenConfig } from '@state/homeScreenAtoms.js';
import type { HomeScreenOptions } from '@state/homeScreenAtoms.js';

export type AppProps = {
  screen: HomeScreenOptions;
};

export function App({ screen }: AppProps) {
  const windowSize = useWindowSize();
  const config = createHomeScreenConfig({
    ...screen,
    columns: screen.columns ?? windowSize.columns ?? DEFAULT_COLUMNS,
    rows: Math.max(MIN_ROWS, screen.rows ?? windowSize.rows ?? DEFAULT_ROWS)
  });

  return <HomeScreen config={config} />;
}
