import { createStore } from 'jotai';
import { describe, expect, it } from 'vitest';
import {
  CREDENTIAL_SOURCE_KEYCHAIN,
  PROVIDER_STATUS_CONNECTED,
  PROVIDER_STATUS_NOT_CONFIGURED
} from '@contracts/backend/providerMessages.ts';
import {
  LoginStep,
  chooseSelectedProviderAtom,
  customBaseUrlAtom,
  customLabelAtom,
  loginProvidersAtom,
  loginSelectedIndexAtom,
  loginStepAtom,
  moveLoginSelectionAtom,
  PROVIDER_ID_CUSTOM,
  PROVIDER_ID_KIMI,
  resetLoginSurfaceAtom
} from '@state/ui/login/index.ts';

describe('login atoms', () => {
  it('moves selection and chooses the expected provider step', () => {
    const store = createStore();
    store.set(loginProvidersAtom, [
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

    store.set(moveLoginSelectionAtom, 1);
    expect(store.get(loginSelectedIndexAtom)).toBe(1);

    store.set(chooseSelectedProviderAtom);
    expect(store.get(loginStepAtom)).toBe(LoginStep.ConnectedActions);
    expect(store.get(customBaseUrlAtom)).toBe('https://api.example.test/v1');
    expect(store.get(customLabelAtom)).toBe('Custom');
  });

  it('resets only non-secret UI state and exposes no API key atom', () => {
    const store = createStore();
    const secret = 'sk-should-not-be-in-login-atoms';

    store.set(customBaseUrlAtom, 'https://api.example.test/v1');
    store.set(customLabelAtom, 'Work');
    store.set(resetLoginSurfaceAtom);

    const values = [
      store.get(customBaseUrlAtom),
      store.get(customLabelAtom),
      store.get(loginStepAtom),
      store.get(loginSelectedIndexAtom)
    ];
    expect(JSON.stringify(values)).not.toContain(secret);
  });
});
