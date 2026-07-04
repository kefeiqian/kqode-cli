import { useWindowSize } from 'ink';
import { useAtomValue, useSetAtom } from 'jotai';
import { useLayoutEffect } from 'react';
import { HelpScreen } from '@components/HelpScreen/index.tsx';
import { HomeScreen } from '@components/HomeScreen/index.tsx';
import { TerminalTooSmall } from '@components/TerminalTooSmall.tsx';
import { useGlobalKeys } from '@/useGlobalKeys.ts';
import { terminalTooSmallAtom, windowColumnsAtom, windowRowsAtom } from '@state/ui/index.ts';
import { helpVisibleAtom } from '@state/ui/help/index.ts';

export function App() {
  useGlobalKeys();
  const windowSize = useWindowSize();
  const setWindowColumns = useSetAtom(windowColumnsAtom);
  const setWindowRows = useSetAtom(windowRowsAtom);
  const tooSmall = useAtomValue(terminalTooSmallAtom);
  const helpVisible = useAtomValue(helpVisibleAtom);

  useLayoutEffect(() => {
    setWindowColumns(windowSize.columns);
    setWindowRows(windowSize.rows);
  }, [setWindowColumns, setWindowRows, windowSize.columns, windowSize.rows]);

  if (tooSmall) {
    return <TerminalTooSmall />;
  }

  return helpVisible ? <HelpScreen /> : <HomeScreen />;
}
