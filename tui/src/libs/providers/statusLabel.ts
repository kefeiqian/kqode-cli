import {
  CREDENTIAL_SOURCE_ENV,
  CREDENTIAL_SOURCE_KEYCHAIN,
  PROVIDER_STATUS_CONNECTED,
  PROVIDER_STATUS_NOT_CONFIGURED
} from '@contracts/backend/providerMessages.ts';
import type { CredentialSource, ProviderStatus } from '@contracts/backend/providerMessages.ts';

/** Formats provider credential status for login/model surfaces. */
export function statusLabel(
  status: ProviderStatus,
  credentialSource: CredentialSource | null,
  cwd?: string
): string {
  if (status === PROVIDER_STATUS_NOT_CONFIGURED) {
    return 'not configured';
  }

  if (status === PROVIDER_STATUS_CONNECTED && credentialSource === CREDENTIAL_SOURCE_KEYCHAIN) {
    return 'connected via keychain';
  }

  if (status === PROVIDER_STATUS_CONNECTED && credentialSource === CREDENTIAL_SOURCE_ENV) {
    return cwd === undefined || cwd.length === 0
      ? 'connected via .env'
      : `connected via .env (\`${cwd}\`)`;
  }

  return 'not configured';
}
