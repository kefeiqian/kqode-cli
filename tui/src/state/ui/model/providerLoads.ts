import {
  MODEL_LIST_STATUS_LOADED,
  PROVIDER_STATUS_CONNECTED
} from '@contracts/backend/providerMessages.ts';
import type {
  ModelInfoWire,
  ModelListResult,
  ProviderStatusInfo
} from '@contracts/backend/providerMessages.ts';
import {
  MODEL_LOAD_STATUS_LOADING,
  MODEL_LOAD_STATUS_NOT_CONNECTED
} from '@state/ui/model/constants.ts';

export type ModelLoadStatus =
  | ModelListResult['status']
  | typeof MODEL_LOAD_STATUS_LOADING
  | typeof MODEL_LOAD_STATUS_NOT_CONNECTED;

export type ProviderModelLoad = { status: ModelLoadStatus; models: ModelInfoWire[] };

/** Creates the initial per-provider model load map for a fresh `/model` open. */
export function initialProviderModelLoads(providers: readonly ProviderStatusInfo[]) {
  return Object.fromEntries(
    providers.map((provider) => [
      provider.providerId,
      {
        status:
          provider.status === PROVIDER_STATUS_CONNECTED
            ? MODEL_LOAD_STATUS_LOADING
            : MODEL_LOAD_STATUS_NOT_CONNECTED,
        models: []
      }
    ])
  ) as Record<string, ProviderModelLoad>;
}

/** Returns whether a provider status row can receive keyboard focus. */
export function isFocusableModelStatus(status: ModelLoadStatus) {
  return status !== MODEL_LIST_STATUS_LOADED;
}
