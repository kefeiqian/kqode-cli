import { atom } from 'jotai';
import { PROVIDER_STATUS_CONNECTED } from '@contracts/backend/providerMessages.ts';
import type { ActiveSelectionResult, ProviderStatusInfo } from '@contracts/backend/providerMessages.ts';
import {
  DEFAULT_MODEL_LABEL,
  formatModelLabel,
  NOT_CONFIGURED_HERE_MODEL_LABEL,
  NOT_CONFIGURED_MODEL_LABEL
} from '@libs/model/index.ts';
import { backendClientAtom } from '@state/global/backend.ts';

const activeModelLabelStateAtom = atom(DEFAULT_MODEL_LABEL);
const activeModelRefreshVersionAtom = atom(0);

/** Backend-resolved status-bar model label for the current workspace. */
export const activeModelLabelAtom = atom((get) => get(activeModelLabelStateAtom));

/** Refreshes the active model label from the backend client seam. */
export const refreshActiveModelAtom = atom(null, async (get, set) => {
  const client = get(backendClientAtom);
  const requestVersion = get(activeModelRefreshVersionAtom) + 1;
  set(activeModelRefreshVersionAtom, requestVersion);

  if (client === undefined) {
    set(activeModelLabelStateAtom, NOT_CONFIGURED_MODEL_LABEL);
    return;
  }

  try {
    const [selection, providers] = await Promise.all([client.getActiveSelection(), client.listProviders()]);
    if (get(activeModelRefreshVersionAtom) !== requestVersion) {
      return;
    }
    set(activeModelLabelStateAtom, resolveActiveModelLabel(selection, providers));
  } catch {
    if (get(activeModelRefreshVersionAtom) === requestVersion) {
      set(activeModelLabelStateAtom, NOT_CONFIGURED_MODEL_LABEL);
    }
  }
});

function resolveActiveModelLabel(
  selection: ActiveSelectionResult,
  providers: readonly ProviderStatusInfo[]
): string {
  if (selection.providerId === null || selection.modelId === null) {
    return NOT_CONFIGURED_MODEL_LABEL;
  }

  const connectedProvider = providers.find(
    (provider) =>
      provider.providerId === selection.providerId && provider.status === PROVIDER_STATUS_CONNECTED
  );
  if (connectedProvider === undefined) {
    return NOT_CONFIGURED_HERE_MODEL_LABEL;
  }

  return formatModelLabel(connectedProvider.label || connectedProvider.providerId, selection.modelId);
}
