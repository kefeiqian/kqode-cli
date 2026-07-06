import {
  CREDENTIAL_SOURCE_ENV,
  CREDENTIAL_SOURCE_KEYCHAIN
} from '@contracts/backend/providerMessages.ts';
import type { CredentialSource } from '@contracts/backend/providerMessages.ts';

const MODEL_LABEL_SEPARATOR = ' · ';

/** Compact source tag for workspace `.env` credentials. */
export const MODEL_SOURCE_TAG_ENV = '.env';

/** Compact source tag for OS-keychain credentials. */
export const MODEL_SOURCE_TAG_KEYCHAIN = 'keychain';

/** Status-bar label shown before a usable backend model is configured. */
export const NOT_CONFIGURED_MODEL_LABEL = 'not configured';

/** Status-bar label shown when the global model is unavailable in this workspace. */
export const NOT_CONFIGURED_HERE_MODEL_LABEL = 'not configured here';

/** Initial model label for first paint before backend state resolves. */
export const DEFAULT_MODEL_LABEL = NOT_CONFIGURED_MODEL_LABEL;

/** Formats the compact provider/model/source label rendered by the status bar. */
export function formatModelLabel(
  providerLabel: string,
  modelId: string,
  source?: CredentialSource | null
): string {
  const provider = providerLabel.trim();
  const model = modelId.trim();
  const sourceTag = modelSourceTag(source);
  const sourceSuffix = sourceTag === null ? '' : `${MODEL_LABEL_SEPARATOR}${sourceTag}`;
  if (provider.length === 0) {
    return `${model}${sourceSuffix}`;
  }
  if (model.length === 0) {
    return `${provider}${sourceSuffix}`;
  }
  return `${provider}${MODEL_LABEL_SEPARATOR}${model}${sourceSuffix}`;
}

/** Converts provider credential source wire values into status-bar tags. */
export function modelSourceTag(source?: CredentialSource | null): string | null {
  if (source === CREDENTIAL_SOURCE_ENV) {
    return MODEL_SOURCE_TAG_ENV;
  }
  if (source === CREDENTIAL_SOURCE_KEYCHAIN) {
    return MODEL_SOURCE_TAG_KEYCHAIN;
  }
  return null;
}
