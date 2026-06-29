import type { ReactNode } from 'react';
import { Box, Text, useIsScreenReaderEnabled, useStdout } from 'ink';

export type BackgroundBlockMode = 'auto' | 'enabled' | 'disabled';

type BackgroundBlockProps = {
  backgroundColor: string;
  children: ReactNode;
  mode?: BackgroundBlockMode;
  width: number;
};

const TRUECOLOR_DEPTH = 24;
export const LOWER_HALF_BLOCK = '▄';
export const UPPER_HALF_BLOCK = '▀';

export function BackgroundBlock({
  backgroundColor,
  children,
  mode = 'auto',
  width
}: BackgroundBlockProps) {
  const { stdout } = useStdout();
  const isScreenReaderEnabled = useIsScreenReaderEnabled();
  const shouldRenderBackground = shouldRenderBackgroundBlock({
    colorDepth: stdout.getColorDepth?.(),
    isNoColor: process.env.NO_COLOR !== undefined,
    isScreenReaderEnabled,
    mode
  });

  if (!shouldRenderBackground) {
    return <>{children}</>;
  }

  const safeWidth = Math.max(1, width);

  return (
    <Box flexDirection="column" width={safeWidth}>
      <Text color={backgroundColor}>{LOWER_HALF_BLOCK.repeat(safeWidth)}</Text>
      <Box backgroundColor={backgroundColor} width={safeWidth}>
        {children}
      </Box>
      <Text color={backgroundColor}>{UPPER_HALF_BLOCK.repeat(safeWidth)}</Text>
    </Box>
  );
}

export function shouldRenderBackgroundBlock({
  colorDepth,
  isNoColor,
  isScreenReaderEnabled,
  mode
}: {
  colorDepth?: number;
  isNoColor: boolean;
  isScreenReaderEnabled: boolean;
  mode: BackgroundBlockMode;
}): boolean {
  if (mode === 'disabled' || isNoColor || isScreenReaderEnabled) {
    return false;
  }

  if (mode === 'enabled') {
    return true;
  }

  return colorDepth !== undefined && colorDepth >= TRUECOLOR_DEPTH;
}
