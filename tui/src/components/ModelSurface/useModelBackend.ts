import { useAtomValue, useSetAtom } from 'jotai';
import { useCallback, useRef } from 'react';
import {
  MODEL_LIST_STATUS_EMPTY,
  MODEL_LIST_STATUS_FAILED,
  MODEL_LIST_STATUS_LOADED,
  PROVIDER_STATUS_CONNECTED
} from '@contracts/backend/providerMessages.ts';
import type { ModelListResult, ProviderStatusInfo } from '@contracts/backend/providerMessages.ts';
import { backendClientAtom } from '@state/global/index.ts';
import { openLoginSurfaceAtom } from '@state/ui/index.ts';
import {
  MODEL_LOAD_STATUS_LOADING,
  resetModelSurfaceAtom,
  setModelActiveSelectionAtom,
  setModelProvidersLoadingAtom,
  setProviderModelLoadAtom
} from '@state/ui/model/index.ts';

/** Backend effects for `/model`: initial parallel loads, retry, and set-active. */
export function useModelBackend(onSelected: () => void) {
  const client = useAtomValue(backendClientAtom);
  const openLogin = useSetAtom(openLoginSurfaceAtom);
  const resetModel = useSetAtom(resetModelSurfaceAtom);
  const setProvidersLoading = useSetAtom(setModelProvidersLoadingAtom);
  const setActiveSelection = useSetAtom(setModelActiveSelectionAtom);
  const setProviderLoad = useSetAtom(setProviderModelLoadAtom);
  const requestVersion = useRef(0);

  const loadProviderModels = useCallback(
    async (providerId: string, version = requestVersion.current) => {
      if (client === undefined) {
        return;
      }
      setProviderLoad({ providerId, load: { status: MODEL_LOAD_STATUS_LOADING, models: [] } });
      try {
        const result = normalizeListResult(await client.listModels(providerId));
        if (requestVersion.current === version) {
          setProviderLoad({ providerId, load: result });
        }
      } catch {
        if (requestVersion.current === version) {
          setProviderLoad({ providerId, load: { status: MODEL_LIST_STATUS_FAILED, models: [] } });
        }
      }
    },
    [client, setProviderLoad]
  );

  const refreshModels = useCallback(async () => {
    resetModel();
    if (client === undefined) {
      openLogin();
      return;
    }
    const version = requestVersion.current + 1;
    requestVersion.current = version;

    try {
      const [providers, active] = await Promise.all([
        client.listProviders(),
        client.getActiveSelection().catch(() => ({ providerId: null, modelId: null }))
      ]);
      if (requestVersion.current !== version) {
        return;
      }
      const connected = providers.filter((provider) => provider.status === PROVIDER_STATUS_CONNECTED);
      if (connected.length === 0) {
        openLogin();
        return;
      }
      setProvidersLoading(connected);
      setActiveSelection(active);
      connected.forEach((provider) => void loadProviderModels(provider.providerId, version));
    } catch {
      if (requestVersion.current === version) {
        openLogin();
      }
    }
  }, [client, loadProviderModels, openLogin, resetModel, setActiveSelection, setProvidersLoading]);

  const selectModel = useCallback(
    async (providerId: string, modelId: string) => {
      if (client === undefined) {
        return;
      }
      await client.setActiveSelection(providerId, modelId);
      setActiveSelection({ providerId, modelId });
      onSelected();
    },
    [client, onSelected, setActiveSelection]
  );

  return { refreshModels, retryProvider: loadProviderModels, selectModel };
}

function normalizeListResult(result: ModelListResult): ModelListResult {
  if (result.status === MODEL_LIST_STATUS_LOADED && result.models.length === 0) {
    return { status: MODEL_LIST_STATUS_EMPTY, models: [] };
  }
  return result;
}
