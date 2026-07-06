import { Text } from 'ink';
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
import { PROVIDER_ID_CUSTOM } from '@state/ui/login/index.ts';
import { theme } from '@theme/themeConfig.ts';

const OUTCOME_MESSAGES: Record<SetKeyOutcome, { color: string; text: string }> = {
  [SET_KEY_OUTCOME_CONNECTED]: {
    color: theme.colors.accentGreen,
    text: 'Connected. Selecting the default model…'
  },
  [SET_KEY_OUTCOME_AUTH_FAILED]: {
    color: theme.colors.errorRed,
    text: 'Authentication failed — fix the key or URL, then retry.'
  },
  [SET_KEY_OUTCOME_RATE_LIMITED]: {
    color: theme.colors.warning,
    text: 'Rate limited — wait & retry.'
  },
  [SET_KEY_OUTCOME_UNREACHABLE]: {
    color: theme.colors.warning,
    text: 'Provider unreachable — wait & retry.'
  },
  [SET_KEY_OUTCOME_NOT_COMPATIBLE]: {
    color: theme.colors.errorRed,
    text: 'Endpoint not compatible — fix the URL; /v1/models must respond like OpenAI.'
  },
  [SET_KEY_OUTCOME_EMPTY_CATALOG]: {
    color: theme.colors.errorRed,
    text: 'Model catalog is empty — fix the key or URL.'
  },
  [SET_KEY_OUTCOME_STORE_FAILED]: {
    color: theme.colors.errorRed,
    text: 'Keychain write failed — set `KIMI_API_KEY` in `.env`, then retry.'
  }
};

/** Themed set-key result copy keyed by backend outcome constants. */
export function OutcomeMessage({ outcome, providerId }: { outcome: SetKeyOutcome | null; providerId: string | null }) {
  if (outcome === null) {
    return null;
  }

  if (outcome === SET_KEY_OUTCOME_STORE_FAILED && providerId === PROVIDER_ID_CUSTOM) {
    return <Text color={theme.colors.errorRed}>Custom can&apos;t be saved while settings storage is unavailable.</Text>;
  }

  const message = OUTCOME_MESSAGES[outcome];
  return <Text color={message.color}>{message.text}</Text>;
}

/** Sensible degraded-mode hint for backend request failures. */
export function RequestErrorMessage({ message }: { message: string | null }) {
  if (message === null) {
    return null;
  }

  return <Text color={theme.colors.warning}>{message}</Text>;
}
