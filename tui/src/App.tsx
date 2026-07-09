import { useInput, useWindowSize } from 'ink';
import { useAtomValue, useSetAtom } from 'jotai';
import { useLayoutEffect } from 'react';
import { HelpScreen } from '@components/HelpScreen/index.tsx';
import { HomeScreen } from '@components/HomeScreen/index.tsx';
import { LoginSurface } from '@components/LoginSurface/index.tsx';
import { ModelSurface } from '@components/ModelSurface/index.tsx';
import { ResumeSurface } from '@components/ResumeSurface/index.tsx';
import { MemorySurface } from '@components/MemorySurface/index.tsx';
import { ThemeSurface } from '@components/ThemeSurface/index.tsx';
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

  useInput((_input, key) => {
    if (
      key.escape &&
      activeSurface !== Surface.Home &&
      activeSurface !== Surface.Login &&
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
    case Surface.Home:
      return <HomeScreen />;
    case Surface.Help:
      return <HelpScreen />;
    case Surface.Login:
      return <LoginSurface />;
    case Surface.Model:
      return <ModelSurface />;
    case Surface.Resume:
      return <ResumeSurface />;
    case Surface.Memory:
      return <MemorySurface />;
    case Surface.Theme:
      return <ThemeSurface />;
  }
}
