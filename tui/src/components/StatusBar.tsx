import { Box, Text } from 'ink';
import { useAtomValue } from 'jotai';
import { useEffect, useState } from 'react';
import {
  armedActionAtom,
  columnsAtom,
  modelLabelAtom,
  statusHintAtom
} from '@state/global/index.ts';
import { PRESS_AGAIN_TO_CLEAR_HINT, PRESS_AGAIN_TO_EXIT_HINT } from '@constants/ui.ts';
import { theme } from '@theme/themeConfig.ts';

export function StatusBar() {
  const columns = useAtomValue(columnsAtom);
  const modelLabel = useAtomValue(modelLabelAtom);
  const statusHint = useAtomValue(statusHintAtom);
  const armedAction = useAtomValue(armedActionAtom);
  const loadingFrame = useLoadingFrame(statusHint?.kind === 'loading');
  const baseHints =
    statusHint === undefined
      ? columns >= 60
        ? '/ commands | @ mention | ? help'
        : '/ | @ | ?'
      : columns >= 60
        ? statusHint.full
        : statusHint.compact;
  const armedHint =
    armedAction === 'clear-input'
      ? PRESS_AGAIN_TO_CLEAR_HINT
      : armedAction === 'exit'
        ? PRESS_AGAIN_TO_EXIT_HINT
        : undefined;
  const leftHints =
    armedHint ??
    (statusHint?.kind === 'loading' ? `${baseHints}${'.'.repeat(loadingFrame)}` : baseHints);
  const showModel = columns >= 60;

  return (
    // Reserve the terminal's final column. With incremental rendering, Ink erases
    // to end-of-line after each row; a glyph rendered into the last column can be
    // dropped on some terminals (WezTerm clipped "GPT-5.5" to "GPT-5."). Keeping
    // the right-aligned model label one column in from the edge avoids that.
    <Box width={columns} paddingRight={1}>
      <Text color={theme.colors.muted}>{leftHints}</Text>
      {showModel ? (
        <Box flexGrow={1} justifyContent="flex-end">
          <Text color={theme.colors.accentGreen}>{modelLabel}</Text>
        </Box>
      ) : null}
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
      setFrame((current) => (current + 1) % 4);
    }, 250);

    return () => {
      clearInterval(timer);
    };
  }, [isLoading]);

  return frame;
}
