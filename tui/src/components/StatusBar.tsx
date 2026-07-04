import { Box, Text } from 'ink';
import { useAtomValue } from 'jotai';
import { useEffect, useState } from 'react';
import {
  columnsAtom,
  modelLabelAtom,
  statusHintAtom
} from '@state/global/index.ts';
import { theme } from '@theme/themeConfig.ts';

export function StatusBar() {
  const columns = useAtomValue(columnsAtom);
  const modelLabel = useAtomValue(modelLabelAtom);
  const statusHint = useAtomValue(statusHintAtom);
  const loadingFrame = useLoadingFrame(statusHint?.kind === 'loading');
  const baseHints =
    statusHint === undefined
      ? columns >= 60
        ? '/ commands | @ mention | ? help'
        : '/ | @ | ?'
      : columns >= 60
        ? statusHint.full
        : statusHint.compact;
  const leftHints =
    statusHint?.kind === 'loading' ? `${baseHints}${'.'.repeat(loadingFrame)}` : baseHints;
  const showModel = columns >= 60;

  return (
    // Fill the terminal's final column for a tight right edge. Ink erases to
    // end-of-line after each row, and some terminals (WezTerm) drop a glyph in
    // the last column — Windows Terminal renders it fine, so the model label is
    // allowed to reach the edge. Restore paddingRight={1} if a terminal clips it.
    <Box width={columns}>
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
