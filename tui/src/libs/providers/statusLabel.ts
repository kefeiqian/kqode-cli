import {
  CREDENTIAL_SOURCE_KEYCHAIN,
  PROVIDER_STATUS_CONNECTED,
  PROVIDER_STATUS_NOT_CONFIGURED
} from '@contracts/backend/providerMessages.ts';
import type { CredentialSource, ProviderStatus } from '@contracts/backend/providerMessages.ts';

/** Formats provider credential status for Connect/model surfaces. */
export function statusLabel(
  status: ProviderStatus,
  credentialSource: CredentialSource | null
): string {
  if (status === PROVIDER_STATUS_NOT_CONFIGURED) {
    return 'not configured';
  }

  if (status === PROVIDER_STATUS_CONNECTED && credentialSource === CREDENTIAL_SOURCE_KEYCHAIN) {
    return 'connected via keychain';
  }


  return 'not configured';
}

/** Formats a short provider-header credential source tag. */
export function providerSourceTag(source: CredentialSource | null): string | null {
  if (source === CREDENTIAL_SOURCE_KEYCHAIN) {
    return 'via keychain';
  }
  return null;
}

/** Appends the short provider-header credential source tag when present. */
export function appendProviderSourceTag(label: string, source: CredentialSource | null): string {
  const tag = providerSourceTag(source);
  return tag === null ? label : `${label} (${tag})`;
}
