import { useWindowSize } from 'ink';
import { useAtomValue, useSetAtom } from 'jotai';
import { useLayoutEffect } from 'react';
import { HomeScreen } from '@components/HomeScreen/index.tsx';
import { TerminalTooSmall } from '@components/TerminalTooSmall.tsx';
import { terminalTooSmallAtom, windowColumnsAtom, windowRowsAtom } from '@state/global/index.ts';

export function App() {
  const windowSize = useWindowSize();
  const setWindowColumns = useSetAtom(windowColumnsAtom);
  const setWindowRows = useSetAtom(windowRowsAtom);
  const tooSmall = useAtomValue(terminalTooSmallAtom);

  useLayoutEffect(() => {
    setWindowColumns(windowSize.columns);
    setWindowRows(windowSize.rows);
  }, [setWindowColumns, setWindowRows, windowSize.columns, windowSize.rows]);

  return tooSmall ? <TerminalTooSmall /> : <HomeScreen />;
}
