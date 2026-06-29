import { Box, Text } from 'ink';
import { COMPACT_HEADER_BELOW_COLUMNS, HIDE_HEADER_BELOW_COLUMNS } from '@components/layout.js';
import { githubDarkTheme } from '@theme/themeConfig.js';

type HeaderProps = {
  productVersion: string;
  columns: number;
};

export function Header({ productVersion, columns }: HeaderProps) {
  if (columns < HIDE_HEADER_BELOW_COLUMNS) {
    return null;
  }

  if (columns < COMPACT_HEADER_BELOW_COLUMNS) {
    return <Text color={githubDarkTheme.colors.accentBlue}>KQode</Text>;
  }

  const versionLabel = ` v${productVersion}`;

  return (
    <Box>
      <Text color={githubDarkTheme.colors.accentBlue}>KQode</Text>
      <Text color={githubDarkTheme.colors.foreground}>{versionLabel}</Text>
    </Box>
  );
}
