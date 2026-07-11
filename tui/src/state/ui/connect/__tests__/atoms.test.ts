import { createStore } from 'jotai';
import { describe, expect, it } from 'vitest';
import {
  CREDENTIAL_SOURCE_KEYCHAIN,
  PROVIDER_STATUS_CONNECTED,
  PROVIDER_STATUS_NOT_CONFIGURED
} from '@contracts/backend/providerMessages.ts';
import {
  ConnectStep,
  chooseSelectedProviderAtom,
  customBaseUrlAtom,
  customLabelAtom,
  connectProvidersAtom,
  connectSelectedIndexAtom,
  connectStepAtom,
  moveConnectSelectionAtom,
  PROVIDER_ID_CUSTOM,
  PROVIDER_ID_KIMI,
  resetConnectSurfaceAtom
} from '@state/ui/connect/index.ts';

describe('Connect atoms', () => {
  it('moves selection and chooses the expected provider step', () => {
    const store = createStore();
    store.set(connectProvidersAtom, [
      {
        providerId: PROVIDER_ID_KIMI,
        label: 'Kimi',
        baseUrl: null,
        defaultModel: null,
        status: PROVIDER_STATUS_NOT_CONFIGURED,
        credentialSource: null
      },
      {
        providerId: PROVIDER_ID_CUSTOM,
        label: 'Custom',
        baseUrl: 'https://api.example.test/v1',
        defaultModel: null,
        status: PROVIDER_STATUS_CONNECTED,
        credentialSource: CREDENTIAL_SOURCE_KEYCHAIN
      }
    ]);

    store.set(moveConnectSelectionAtom, 1);
    expect(store.get(connectSelectedIndexAtom)).toBe(1);

    store.set(chooseSelectedProviderAtom);
    expect(store.get(connectStepAtom)).toBe(ConnectStep.ConnectedActions);
    expect(store.get(customBaseUrlAtom)).toBe('https://api.example.test/v1');
    expect(store.get(customLabelAtom)).toBe('Custom');
  });

  it('resets only non-secret UI state and exposes no API key atom', () => {
    const store = createStore();
    const secret = 'sk-should-not-be-in-Connect-atoms';

    store.set(customBaseUrlAtom, 'https://api.example.test/v1');
    store.set(customLabelAtom, 'Work');
    store.set(resetConnectSurfaceAtom);

    const values = [
      store.get(customBaseUrlAtom),
      store.get(customLabelAtom),
      store.get(connectStepAtom),
      store.get(connectSelectedIndexAtom)
    ];
    expect(JSON.stringify(values)).not.toContain(secret);
  });
});
