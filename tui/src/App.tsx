import { useInput, useWindowSize } from 'ink';
import { useAtomValue, useSetAtom } from 'jotai';
import { useLayoutEffect } from 'react';
import { HelpScreen } from '@components/HelpScreen/index.tsx';
import { HomeScreen } from '@components/HomeScreen/index.tsx';
import { ConnectSurface } from '@components/ConnectSurface/index.tsx';
import { TerminalTooSmall } from '@components/TerminalTooSmall.tsx';
import { useGlobalKeys } from '@/useGlobalKeys.ts';
import {
  activeSurfaceAtom,
  armedActionAtom,
  closeActiveSurfaceAtom,
  Surface,
  terminalTooSmallAtom,
  windowColumnsAtom,
  windowRowsAtom
} from '@state/ui/index.ts';
import { memorySurfaceConsumesEscAtom } from '@state/ui/memory/index.ts';
import { modelSurfaceConsumesEscAtom } from '@state/ui/model/index.ts';

export function App() {
  useGlobalKeys();
  const windowSize = useWindowSize();
  const setWindowColumns = useSetAtom(windowColumnsAtom);
  const setWindowRows = useSetAtom(windowRowsAtom);
  const tooSmall = useAtomValue(terminalTooSmallAtom);
  const activeSurface = useAtomValue(activeSurfaceAtom);
  const closeActiveSurface = useSetAtom(closeActiveSurfaceAtom);
  const setArmedAction = useSetAtom(armedActionAtom);
  const memoryConsumesEsc = useAtomValue(memorySurfaceConsumesEscAtom);
  const modelConsumesEsc = useAtomValue(modelSurfaceConsumesEscAtom);

  useInput((_input, key) => {
    if (
      key.escape &&
      activeSurface !== Surface.Home &&
      activeSurface !== Surface.Connect &&
      !(activeSurface === Surface.Model && modelConsumesEsc) &&
      !(activeSurface === Surface.Memory && memoryConsumesEsc)
    ) {
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
    case Surface.Help:
      return <HelpScreen />;
    case Surface.Connect:
      return <ConnectSurface />;
    case Surface.Home:
    case Surface.Theme:
    case Surface.Model:
    case Surface.Memory:
      return <HomeScreen />;
  }
}
