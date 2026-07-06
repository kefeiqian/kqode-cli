import { describe, expect, it } from 'vitest';
import {
  CREDENTIAL_SOURCE_ENV,
  CREDENTIAL_SOURCE_KEYCHAIN,
  PROVIDER_STATUS_CONNECTED,
  PROVIDER_STATUS_NOT_CONFIGURED
} from '@contracts/backend/providerMessages.ts';
import { statusLabel } from '@libs/providers/statusLabel.ts';

describe('statusLabel', () => {
  it('formats connected and not-configured states', () => {
    expect(statusLabel(PROVIDER_STATUS_CONNECTED, CREDENTIAL_SOURCE_KEYCHAIN)).toBe(
      'connected via keychain'
    );
    expect(statusLabel(PROVIDER_STATUS_CONNECTED, CREDENTIAL_SOURCE_ENV, 'C:\\repo')).toBe(
      'connected via .env (`C:\\repo`)'
    );
    expect(statusLabel(PROVIDER_STATUS_NOT_CONFIGURED, null)).toBe('not configured');
  });
});
