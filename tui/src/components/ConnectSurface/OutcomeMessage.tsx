import { Text } from 'ink';
import { useAtomValue } from 'jotai';
import {
  SET_KEY_OUTCOME_AUTH_FAILED,
  SET_KEY_OUTCOME_CONNECTED,
  SET_KEY_OUTCOME_EMPTY_CATALOG,
  SET_KEY_OUTCOME_NOT_COMPATIBLE,
  SET_KEY_OUTCOME_RATE_LIMITED,
  SET_KEY_OUTCOME_STORE_FAILED,
  SET_KEY_OUTCOME_UNREACHABLE
} from '@contracts/backend/providerMessages.ts';
import type { SetKeyOutcome } from '@contracts/backend/providerMessages.ts';
import { PROVIDER_ID_CUSTOM } from '@state/ui/connect/index.ts';
import { activeThemeAtom } from '@state/global/index.ts';
import type { ThemeColors } from '@theme/themeConfig.ts';

const OUTCOME_MESSAGES: Record<SetKeyOutcome, { colorToken: keyof ThemeColors; text: string }> = {
  [SET_KEY_OUTCOME_CONNECTED]: {
    colorToken: 'accentGreen',
    text: 'Connected. Selecting the default model…'
  },
  [SET_KEY_OUTCOME_AUTH_FAILED]: {
    colorToken: 'errorRed',
    text: 'Authentication failed — fix the key or URL, then retry.'
  },
  [SET_KEY_OUTCOME_RATE_LIMITED]: {
    colorToken: 'warning',
    text: 'Rate limited — wait & retry.'
  },
  [SET_KEY_OUTCOME_UNREACHABLE]: {
    colorToken: 'warning',
    text: 'Provider unreachable — wait & retry.'
  },
  [SET_KEY_OUTCOME_NOT_COMPATIBLE]: {
    colorToken: 'errorRed',
    text: 'Endpoint not compatible — fix the URL; /v1/models must respond like OpenAI.'
  },
  [SET_KEY_OUTCOME_EMPTY_CATALOG]: {
    colorToken: 'errorRed',
    text: 'Model catalog is empty — fix the key or URL.'
  },
  [SET_KEY_OUTCOME_STORE_FAILED]: {
    colorToken: 'errorRed',
    text: 'Keychain write failed — unlock or repair the OS keychain, then retry.'
  }
};

/** Themed set-key result copy keyed by backend outcome constants. */
export function OutcomeMessage({ outcome, providerId }: { outcome: SetKeyOutcome | null; providerId: string | null }) {
  const theme = useAtomValue(activeThemeAtom);

  if (outcome === null) {
    return null;
  }

  if (outcome === SET_KEY_OUTCOME_STORE_FAILED && providerId === PROVIDER_ID_CUSTOM) {
    return <Text color={theme.colors.errorRed}>Custom can&apos;t be saved while settings storage is unavailable.</Text>;
  }

  const message = OUTCOME_MESSAGES[outcome];
  return <Text color={theme.colors[message.colorToken]}>{message.text}</Text>;
}

/** Sensible degraded-mode hint for backend request failures. */
export function RequestErrorMessage({ message }: { message: string | null }) {
  const theme = useAtomValue(activeThemeAtom);

  if (message === null) {
    return null;
  }

  return <Text color={theme.colors.warning}>{message}</Text>;
}
