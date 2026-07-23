import { Box, Text } from 'ink';
import { useAtomValue } from 'jotai';
import { useEffect, useState } from 'react';
import { armedActionAtom, chromeColumnsAtom, statusHintAtom } from '@state/ui/index.ts';
import { modelLabelAtom } from '@state/global/index.ts';
import {
  ArmedAction,
  DEFAULT_STATUS_HINTS,
  LOADING_FRAME_COUNT,
  LOADING_FRAME_INTERVAL_MS,
  PRESS_AGAIN_TO_CLEAR_HINT,
  PRESS_AGAIN_TO_EXIT_HINT
} from '@constants/ui.ts';
import { theme } from '@theme/themeConfig.ts';

export function StatusBar() {
  const columns = useAtomValue(chromeColumnsAtom);
  const modelLabel = useAtomValue(modelLabelAtom);
  const statusHint = useAtomValue(statusHintAtom);
  const armedAction = useAtomValue(armedActionAtom);
  const loadingFrame = useLoadingFrame(statusHint?.kind === 'loading');
  const baseHints = statusHint === undefined ? DEFAULT_STATUS_HINTS : statusHint.text;
  const armedHint =
    armedAction === ArmedAction.ClearInput
      ? PRESS_AGAIN_TO_CLEAR_HINT
      : armedAction === ArmedAction.Exit
        ? PRESS_AGAIN_TO_EXIT_HINT
        : undefined;
  const leftHints =
    armedHint ??
    (statusHint?.kind === 'loading' ? `${baseHints}${'.'.repeat(loadingFrame)}` : baseHints);

  return (
    // Chrome stops before the physical final cell; the root body background
    // paints that safety gutter. BodyPane alone owns scrollbar rendering.
    <Box width={columns} backgroundColor={theme.colors.bodyBackground}>
      <Text color={theme.colors.muted}>{leftHints}</Text>
      <Box flexGrow={1} justifyContent="flex-end">
        <Text color={theme.colors.accentGreen}>{modelLabel}</Text>
      </Box>
    </Box>
  );
}

function useLoadingFrame(isLoading: boolean): number {
  const [frame, setFrame] = useState(0);

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
  }, [isLoading]);

  return frame;
}
