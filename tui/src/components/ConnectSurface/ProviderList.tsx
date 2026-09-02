import { Box, Text } from 'ink';
import { useAtomValue } from 'jotai';
import { SelectableRow } from '@components/SelectableRow/index.tsx';
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
  const label = statusLabel(provider.status, provider.credentialSource);
  return <SelectableRow highlighted={isSelected} content={`${provider.label} — ${label}`} />;
}
