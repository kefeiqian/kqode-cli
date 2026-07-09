import { Box, Text } from 'ink';
import { useAtomValue } from 'jotai';
import { statusLabel } from '@libs/providers/index.ts';
import type { ProviderStatusInfo } from '@contracts/backend/providerMessages.ts';
import { activeThemeAtom } from '@state/global/index.ts';

/** Selectable backend provider rows with credential source status. */
export function ProviderList({
  providers,
  selectedIndex
}: {
  providers: ProviderStatusInfo[];
  selectedIndex: number;
}) {
  const theme = useAtomValue(activeThemeAtom);

  if (providers.length === 0) {
    return <Text color={theme.colors.muted}>Loading providers…</Text>;
  }

  return (
    <Box flexDirection="column">
      {providers.map((provider, index) => (
        <ProviderRow
          key={provider.providerId}
          isSelected={index === selectedIndex}
          provider={provider}
        />
      ))}
    </Box>
  );
}

function ProviderRow({
  isSelected,
  provider
}: {
  isSelected: boolean;
  provider: ProviderStatusInfo;
}) {
  const theme = useAtomValue(activeThemeAtom);
  const prefix = isSelected ? '›' : ' ';
  const color = isSelected ? theme.colors.accentBlue : theme.colors.foreground;
  const label = statusLabel(provider.status, provider.credentialSource);

  return (
    <Box>
      <Text color={color} wrap="truncate">
        {prefix} {provider.label} — {label}
      </Text>
    </Box>
  );
}
