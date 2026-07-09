import { Box, Text } from 'ink';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useEffect } from 'react';
import { activeModelLabelAtom, refreshActiveModelAtom } from '@state/global/index.ts';
import { turnInFlightAtom } from '@state/promptQueue/index.ts';
import {
  activeSurfaceAtom,
  armedActionAtom,
  AUTO_COMPACTING_HINT,
  compactionInProgressAtom,
  copyModeActiveAtom,
  loadingFrameAtom,
  safeChromeColumnsAtom,
  setTransientStatusHintAtom,
  startupStatusHintAtom,
  Surface,
  transientStatusHintAtom,
  WORKING_STATUS_HINT
} from '@state/ui/index.ts';
import {
  ArmedAction,
  COPY_MODE_HINT,
  DEFAULT_STATUS_HINTS,
  LOADING_FRAME_COUNT,
  LOADING_FRAME_INTERVAL_MS,
  PRESS_AGAIN_TO_CLEAR_HINT,
  PRESS_AGAIN_TO_EXIT_HINT,
  TRANSIENT_STATUS_HINT_MS
} from '@constants/ui.ts';
import { theme } from '@theme/themeConfig.ts';

export function StatusBar() {
  const columns = useAtomValue(safeChromeColumnsAtom);
  const modelLabel = useAtomValue(activeModelLabelAtom);
  const startupStatusHint = useAtomValue(startupStatusHintAtom);
  const transientStatusHint = useAtomValue(transientStatusHintAtom);
  const copyModeActive = useAtomValue(copyModeActiveAtom);
  const armedAction = useAtomValue(armedActionAtom);
  const turnInFlight = useAtomValue(turnInFlightAtom);
  const compactionInProgress = useAtomValue(compactionInProgressAtom);
  useActiveModelRefresh();
  useTransientStatusHintClear(transientStatusHint);
  // Backend startup takes precedence over the working spinner, which in turn
  // sits ahead of Copy Mode; a loading-kind hint drives the animated dots.
  const persistentStatusHint =
    startupStatusHint ??
    (compactionInProgress ? AUTO_COMPACTING_HINT : undefined) ??
    (turnInFlight ? WORKING_STATUS_HINT : undefined) ??
    (copyModeActive ? { text: COPY_MODE_HINT } : undefined);
  const loadingFrame = useLoadingFrame(persistentStatusHint?.kind === 'loading');
  const baseHints = persistentStatusHint?.text ?? transientStatusHint?.text ?? DEFAULT_STATUS_HINTS;
  const armedHint =
    armedAction === ArmedAction.ClearInput
      ? PRESS_AGAIN_TO_CLEAR_HINT
      : armedAction === ArmedAction.Exit
        ? PRESS_AGAIN_TO_EXIT_HINT
        : undefined;
  const leftHints =
    armedHint ??
    (persistentStatusHint?.kind === 'loading' ? `${baseHints}${'.'.repeat(loadingFrame)}` : baseHints);
  const renderedModelLabel = truncateStatusModelLabel(modelLabel, columns, leftHints.length);

  return (
    // Stay inside the shared safe chrome width so the status label does not
    // depend on terminals rendering a glyph in the physical final column.
    <Box width={columns}>
      <Text color={theme.colors.muted} wrap="truncate">
        {leftHints}
      </Text>
      <Box flexGrow={1} justifyContent="flex-end">
        <Text color={theme.colors.accentGreen} wrap="truncate">
          {renderedModelLabel}
        </Text>
      </Box>
    </Box>
  );
}

function useTransientStatusHintClear(transientStatusHint: unknown) {
  const setTransientStatusHint = useSetAtom(setTransientStatusHintAtom);

  useEffect(() => {
    if (transientStatusHint === undefined) {
      return;
    }

    const timer = setTimeout(() => {
      setTransientStatusHint(undefined);
    }, TRANSIENT_STATUS_HINT_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [setTransientStatusHint, transientStatusHint]);
}

function useActiveModelRefresh() {
  const activeSurface = useAtomValue(activeSurfaceAtom);
  const refreshActiveModel = useSetAtom(refreshActiveModelAtom);

  useEffect(() => {
    if (activeSurface === Surface.Home) {
      void refreshActiveModel();
    }
  }, [activeSurface, refreshActiveModel]);
}

function useLoadingFrame(isLoading: boolean): number {
  // Backed by the shared `loadingFrameAtom` (not local state) so the prompt
  // composer can subscribe and re-assert the terminal caret on each tick — see
  // the atom's doc comment. The StatusBar is the single interval driver.
  const [frame, setFrame] = useAtom(loadingFrameAtom);

  useEffect(() => {
    if (!isLoading) {
      setFrame(0);
      return;
    }

    const timer = setInterval(() => {
      setFrame((current) => (current + 1) % LOADING_FRAME_COUNT);
    }, LOADING_FRAME_INTERVAL_MS);

    return () => {
      clearInterval(timer);
    };
  }, [isLoading, setFrame]);

  return frame;
}

function truncateStatusModelLabel(label: string, columns: number, leftColumns: number): string {
  const availableColumns = Math.max(0, columns - leftColumns);
  return label.slice(0, availableColumns);
}
