import { atom } from 'jotai';
import {
  PROVIDER_STATUS_CONNECTED,
  SET_KEY_OUTCOME_CONNECTED
} from '@contracts/backend/providerMessages.ts';
import type { ProviderStatusInfo, SetKeyResult } from '@contracts/backend/providerMessages.ts';

/** Backend provider id for the built-in Kimi preset. */
export const PROVIDER_ID_KIMI = 'kimi';

/** Backend provider id for an OpenAI-compatible custom endpoint. */
export const PROVIDER_ID_CUSTOM = 'custom';

/** Fixed Kimi base URL rendered read-only in the login surface. */
export const KIMI_BASE_URL = 'https://api.moonshot.cn/v1';

/** Focusable steps in the interactive login surface. */
export const LoginStep = {
  List: 'list',
  ConnectedActions: 'connectedActions',
  CustomUrl: 'customUrl',
  CustomLabel: 'customLabel',
  Key: 'key'
} as const;

export type LoginStep = (typeof LoginStep)[keyof typeof LoginStep];

/** Last provider mutation outcome plus display context. */
export type LoginOutcome = SetKeyResult & { providerId: string };

/** Backend-computed provider rows shown by `/login`. */
export const loginProvidersAtom = atom<ProviderStatusInfo[]>([]);

/** Whether provider settings can persist to the local SQLite store. */
export const loginPersistenceAvailableAtom = atom(true);

/** Currently highlighted provider row in the list. */
export const loginSelectedIndexAtom = atom(0);

/** Current login form step/focus. */
export const loginStepAtom = atom<LoginStep>(LoginStep.List);

/** Whether a backend login/clear mutation is in flight. */
export const loginInFlightAtom = atom(false);

/** Last set-key outcome rendered for retryable failures. */
export const loginLastOutcomeAtom = atom<LoginOutcome | null>(null);

/** Non-secret request error rendered as a degraded backend hint. */
export const loginRequestErrorAtom = atom<string | null>(null);

/** Custom provider base URL draft. This atom never stores API keys. */
export const customBaseUrlAtom = atom('');

/** Custom provider optional label draft. This atom never stores API keys. */
export const customLabelAtom = atom('');

/** Inline validation message for the Custom base URL field. */
export const customBaseUrlErrorAtom = atom<string | null>(null);

/** Inline validation message for the Custom label field. */
export const customLabelErrorAtom = atom<string | null>(null);

/** Highlighted connected-provider action: 0 = replace, 1 = clear. */
export const connectedActionIndexAtom = atom(0);

/** One-key destructive clear confirmation state. */
export const clearConfirmAtom = atom(false);

/** Provider row currently highlighted by index. */
export const selectedProviderAtom = atom((get) => {
  const providers = get(loginProvidersAtom);
  return providers[get(loginSelectedIndexAtom)] ?? null;
});

/** Resets non-secret `/login` UI state when the surface opens. */
export const resetLoginSurfaceAtom = atom(null, (_get, set) => {
  set(loginSelectedIndexAtom, 0);
  set(loginStepAtom, LoginStep.List);
  set(loginInFlightAtom, false);
  set(loginLastOutcomeAtom, null);
  set(loginRequestErrorAtom, null);
  set(loginPersistenceAvailableAtom, true);
  set(customBaseUrlAtom, '');
  set(customLabelAtom, '');
  set(customBaseUrlErrorAtom, null);
  set(customLabelErrorAtom, null);
  set(connectedActionIndexAtom, 0);
  set(clearConfirmAtom, false);
});

/** Moves the provider list highlight, clamped to available backend rows. */
export const moveLoginSelectionAtom = atom(null, (get, set, delta: number) => {
  const maxIndex = Math.max(0, get(loginProvidersAtom).length - 1);
  const current = get(loginSelectedIndexAtom);
  set(loginSelectedIndexAtom, Math.min(maxIndex, Math.max(0, current + delta)));
});

/** Opens the selected provider flow without ever touching API key material. */
export const chooseSelectedProviderAtom = atom(null, (get, set) => {
  const provider = get(selectedProviderAtom);
  if (provider === null) {
    return;
  }

  set(loginLastOutcomeAtom, null);
  set(loginRequestErrorAtom, null);
  set(clearConfirmAtom, false);
  set(connectedActionIndexAtom, 0);

  if (provider.providerId === PROVIDER_ID_CUSTOM) {
    set(customBaseUrlAtom, provider.baseUrl ?? '');
    set(customLabelAtom, provider.baseUrl === null ? '' : provider.label);
  }

  set(
    loginStepAtom,
    provider.status === PROVIDER_STATUS_CONNECTED
      ? LoginStep.ConnectedActions
      : provider.providerId === PROVIDER_ID_CUSTOM
        ? LoginStep.CustomUrl
        : LoginStep.Key
  );
});

/** Backs out one visible login step, returning to the list at the top. */
export const backLoginStepAtom = atom(null, (get, set) => {
  const step = get(loginStepAtom);
  const provider = get(selectedProviderAtom);
  set(clearConfirmAtom, false);

  if (step === LoginStep.CustomLabel) {
    set(loginStepAtom, LoginStep.CustomUrl);
  } else if (step === LoginStep.Key && provider?.providerId === PROVIDER_ID_CUSTOM) {
    set(loginStepAtom, LoginStep.CustomLabel);
  } else {
    set(loginStepAtom, LoginStep.List);
  }
});

/** Marks a connected set-key result; callers close the surface after refresh. */
export const didConnectAtom = atom((get) => {
  return get(loginLastOutcomeAtom)?.outcome === SET_KEY_OUTCOME_CONNECTED;
});
