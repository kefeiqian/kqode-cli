import { Box, Text, useInput, useWindowSize } from 'ink';
import { useAtomValue, useSetAtom } from 'jotai';
import { useLayoutEffect } from 'react';
import { HelpScreen } from '@components/HelpScreen/index.tsx';
import { HomeScreen } from '@components/HomeScreen/index.tsx';
import { LoginSurface } from '@components/LoginSurface/index.tsx';
import { TerminalTooSmall } from '@components/TerminalTooSmall.tsx';
import { useGlobalKeys } from '@/useGlobalKeys.ts';
import {
  activeSurfaceAtom,
  armedActionAtom,
  closeActiveSurfaceAtom,
  columnsAtom,
  rowsAtom,
  Surface,
  terminalTooSmallAtom,
  windowColumnsAtom,
  windowRowsAtom
} from '@state/ui/index.ts';
import { theme } from '@theme/themeConfig.ts';

export function App() {
  useGlobalKeys();
  const windowSize = useWindowSize();
  const setWindowColumns = useSetAtom(windowColumnsAtom);
  const setWindowRows = useSetAtom(windowRowsAtom);
  const tooSmall = useAtomValue(terminalTooSmallAtom);
  const activeSurface = useAtomValue(activeSurfaceAtom);
  const closeActiveSurface = useSetAtom(closeActiveSurfaceAtom);
  const setArmedAction = useSetAtom(armedActionAtom);

  useInput((_input, key) => {
    if (key.escape && activeSurface !== Surface.Home && activeSurface !== Surface.Login) {
      setArmedAction(null);
      closeActiveSurface();
    }
  });

  useLayoutEffect(() => {
    setWindowColumns(windowSize.columns);
    setWindowRows(windowSize.rows);
  }, [setWindowColumns, setWindowRows, windowSize.columns, windowSize.rows]);

  if (tooSmall) {
    return <TerminalTooSmall />;
  }

  switch (activeSurface) {
    case Surface.Home:
      return <HomeScreen />;
    case Surface.Help:
      return <HelpScreen />;
    case Surface.Login:
      return <LoginSurface />;
    case Surface.Model:
      return <PendingSurface title="/model" />;
  }
}

function PendingSurface({ title }: { title: string }) {
  const columns = useAtomValue(columnsAtom);
  const rows = useAtomValue(rowsAtom);

  return (
    <Box
      flexDirection="column"
      width={columns}
      height={rows}
      backgroundColor={theme.colors.bodyBackground}
    >
      <Text color={theme.colors.accentBlue}>{title}</Text>
      <Text color={theme.colors.muted}>Surface implementation follows in the next unit. Esc returns home.</Text>
    </Box>
  );
}
