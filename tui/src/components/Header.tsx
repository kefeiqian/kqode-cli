import { Box, Text } from 'ink';
import { COMPACT_HEADER_BELOW_COLUMNS, HIDE_HEADER_BELOW_COLUMNS } from '@libs/tui/layout.js';
import { geminiDarkTheme } from '@theme/themeConfig.js';

type HeaderProps = {
  productVersion: string;
  columns: number;
};

export function Header({ productVersion, columns }: HeaderProps) {
  if (columns < HIDE_HEADER_BELOW_COLUMNS) {
    return null;
  }

  if (columns < COMPACT_HEADER_BELOW_COLUMNS) {
    return <Text color={geminiDarkTheme.colors.accentBlue}>KQode</Text>;
  }

  const versionLabel = ` v${productVersion}`;

  return (
    <Box>
      <Text color={geminiDarkTheme.colors.accentBlue}>KQode</Text>
      <Text color={geminiDarkTheme.colors.foreground}>{versionLabel}</Text>
    </Box>
  );
}
