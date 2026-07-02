import { Box, Text } from 'ink';
import { useAtomValue } from 'jotai';
import { COMPACT_HEADER_BELOW_COLUMNS, HIDE_HEADER_BELOW_COLUMNS } from '@constants/ui.ts';
import { PRODUCT_NAME } from '@constants/product.ts';
import { columnsAtom, productVersionAtom } from '@state/global/index.ts';
import { theme } from '@theme/themeConfig.ts';

export function Header() {
  const columns = useAtomValue(columnsAtom);
  const productVersion = useAtomValue(productVersionAtom);

  if (columns < HIDE_HEADER_BELOW_COLUMNS) {
    return null;
  }

  if (columns < COMPACT_HEADER_BELOW_COLUMNS) {
    return <Text color={theme.colors.accentBlue}>{PRODUCT_NAME}</Text>;
  }

  const versionLabel = ` v${productVersion}`;

  return (
    <Box>
      <Text color={theme.colors.accentBlue}>{PRODUCT_NAME}</Text>
      <Text color={theme.colors.foreground}>{versionLabel}</Text>
    </Box>
  );
}
