import { Box, Text } from 'ink';
import { useAtomValue } from 'jotai';
import { PRODUCT_NAME } from '@constants/product.ts';
import { activeThemeAtom, productVersionAtom } from '@state/global/index.ts';

export function Header() {
  const productVersion = useAtomValue(productVersionAtom);
  const theme = useAtomValue(activeThemeAtom);
  const versionLabel = ` v${productVersion}`;

  return (
    <Box>
      <Text color={theme.colors.accentBlue}>{PRODUCT_NAME}</Text>
      <Text color={theme.colors.foreground}>{versionLabel}</Text>
    </Box>
  );
}
