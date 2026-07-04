import { Box, Text } from 'ink';
import { useAtomValue } from 'jotai';
import { PRODUCT_NAME } from '@constants/product.ts';
import { productVersionAtom } from '@state/global/index.ts';
import { theme } from '@theme/themeConfig.ts';

export function Header() {
  const productVersion = useAtomValue(productVersionAtom);
  const versionLabel = ` v${productVersion}`;

  return (
    <Box>
      <Text color={theme.colors.accentBlue}>{PRODUCT_NAME}</Text>
      <Text color={theme.colors.foreground}>{versionLabel}</Text>
    </Box>
  );
}
