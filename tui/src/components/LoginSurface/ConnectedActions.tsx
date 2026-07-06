import { Box, Text } from 'ink';
import type { ProviderStatusInfo } from '@contracts/backend/providerMessages.ts';
import { theme } from '@theme/themeConfig.ts';

export const CONNECTED_ACTION_REPLACE_INDEX = 0;
export const CONNECTED_ACTION_CLEAR_INDEX = 1;

/** Explicit replace/clear actions for already-connected providers. */
export function ConnectedActions({
  actionIndex,
  confirmClear,
  provider
}: {
  actionIndex: number;
  confirmClear: boolean;
  provider: ProviderStatusInfo;
}) {
  return (
    <Box flexDirection="column">
      <Text color={theme.colors.accentBlue}>{provider.label} is already connected.</Text>
      <ActionRow active={actionIndex === CONNECTED_ACTION_REPLACE_INDEX} text="[r] Replace key" />
      <ActionRow active={actionIndex === CONNECTED_ACTION_CLEAR_INDEX} text="[c] Clear saved key" />
      {confirmClear ? (
        <Text color={theme.colors.warning}>Press y to confirm clear, or n/Esc to cancel.</Text>
      ) : (
        <Text color={theme.colors.muted}>Enter chooses · ↑/↓ moves · Esc back</Text>
      )}
    </Box>
  );
}

function ActionRow({ active, text }: { active: boolean; text: string }) {
  return (
    <Text color={active ? theme.colors.accentBlue : theme.colors.foreground}>
      {active ? '›' : ' '} {text}
    </Text>
  );
}
