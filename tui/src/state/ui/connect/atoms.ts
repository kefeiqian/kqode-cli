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

/** Fixed Kimi base URL rendered read-only in the connect surface. */
export const KIMI_BASE_URL = 'https://api.moonshot.cn/v1';

/** Focusable steps in the interactive connect surface. */
export const ConnectStep = {
  List: 'list',
  ConnectedActions: 'connectedActions',
  CustomUrl: 'customUrl',
  CustomLabel: 'customLabel',
  Key: 'key'
} as const;

export type ConnectStep = (typeof ConnectStep)[keyof typeof ConnectStep];

/** Last provider mutation outcome plus display context. */
export type ConnectOutcome = SetKeyResult & { providerId: string };

/** Backend-computed provider rows shown by `/connect`. */
export const connectProvidersAtom = atom<ProviderStatusInfo[]>([]);

/** Currently highlighted provider row in the list. */
export const connectSelectedIndexAtom = atom(0);

/** Current connect form step/focus. */
export const connectStepAtom = atom<ConnectStep>(ConnectStep.List);

/** Whether a backend connect/clear mutation is in flight. */
export const connectInFlightAtom = atom(false);

/** Last set-key outcome rendered for retryable failures. */
export const connectLastOutcomeAtom = atom<ConnectOutcome | null>(null);

/** Non-secret request error rendered as a degraded backend hint. */
export const connectRequestErrorAtom = atom<string | null>(null);

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
  const providers = get(connectProvidersAtom);
  return providers[get(connectSelectedIndexAtom)] ?? null;
});

/** Resets non-secret `/connect` UI state when the surface opens. */
export const resetConnectSurfaceAtom = atom(null, (_get, set) => {
  set(connectSelectedIndexAtom, 0);
  set(connectStepAtom, ConnectStep.List);
  set(connectInFlightAtom, false);
  set(connectLastOutcomeAtom, null);
  set(connectRequestErrorAtom, null);
  set(customBaseUrlAtom, '');
  set(customLabelAtom, '');
  set(customBaseUrlErrorAtom, null);
  set(customLabelErrorAtom, null);
  set(connectedActionIndexAtom, 0);
  set(clearConfirmAtom, false);
});

/** Moves the provider list highlight, clamped to available backend rows. */
export const moveConnectSelectionAtom = atom(null, (get, set, delta: number) => {
  const maxIndex = Math.max(0, get(connectProvidersAtom).length - 1);
  const current = get(connectSelectedIndexAtom);
  set(connectSelectedIndexAtom, Math.min(maxIndex, Math.max(0, current + delta)));
});

/** Opens the selected provider flow without ever touching API key material. */
export const chooseSelectedProviderAtom = atom(null, (get, set) => {
  const provider = get(selectedProviderAtom);
  if (provider === null) {
    return;
  }

  set(connectLastOutcomeAtom, null);
  set(connectRequestErrorAtom, null);
  set(clearConfirmAtom, false);
  set(connectedActionIndexAtom, 0);

  if (provider.providerId === PROVIDER_ID_CUSTOM) {
    set(customBaseUrlAtom, provider.baseUrl ?? '');
    set(customLabelAtom, provider.baseUrl === null ? '' : provider.label);
  }

  set(
    connectStepAtom,
    provider.status === PROVIDER_STATUS_CONNECTED
      ? ConnectStep.ConnectedActions
      : provider.providerId === PROVIDER_ID_CUSTOM
        ? ConnectStep.CustomUrl
        : ConnectStep.Key
  );
});

/** Backs out one visible connect step, returning to the list at the top. */
export const backConnectStepAtom = atom(null, (get, set) => {
  const step = get(connectStepAtom);
  const provider = get(selectedProviderAtom);
  set(clearConfirmAtom, false);

  if (step === ConnectStep.CustomLabel) {
    set(connectStepAtom, ConnectStep.CustomUrl);
  } else if (step === ConnectStep.Key && provider?.providerId === PROVIDER_ID_CUSTOM) {
    set(connectStepAtom, ConnectStep.CustomLabel);
  } else {
    set(connectStepAtom, ConnectStep.List);
  }
});

/** Marks a connected set-key result; callers close the surface after refresh. */
export const didConnectAtom = atom((get) => {
  return get(connectLastOutcomeAtom)?.outcome === SET_KEY_OUTCOME_CONNECTED;
});
