import { Box, Text } from 'ink';
import { useAtomValue } from 'jotai';
import { statusLabel } from '@libs/providers/index.ts';
import type { ProviderStatusInfo } from '@contracts/backend/providerMessages.ts';
import { activeThemeAtom } from '@state/global/index.ts';

/** Selectable backend provider rows with credential source status. */
export function ProviderList({
  cwd,
  providers,
  selectedIndex
}: {
  cwd: string;
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
          cwd={cwd}
          isSelected={index === selectedIndex}
          provider={provider}
        />
      ))}
    </Box>
  );
}

function ProviderRow({
  cwd,
  isSelected,
  provider
}: {
  cwd: string;
  isSelected: boolean;
  provider: ProviderStatusInfo;
}) {
  const theme = useAtomValue(activeThemeAtom);
  const prefix = isSelected ? '›' : ' ';
  const color = isSelected ? theme.colors.accentBlue : theme.colors.foreground;
  const label = statusLabel(provider.status, provider.credentialSource, cwd);

  return (
    <Box>
      <Text color={color} wrap="truncate">
        {prefix} {provider.label} — {label}
      </Text>
    </Box>
  );
}
