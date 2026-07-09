import { useAtomValue, useSetAtom } from 'jotai';
import { useCallback } from 'react';
import { KIMI_BASE_URL, ConnectStep, PROVIDER_ID_CUSTOM } from '@state/ui/connect/index.ts';
import {
  customBaseUrlErrorAtom,
  customLabelErrorAtom,
  connectInFlightAtom,
  connectLastOutcomeAtom,
  setConnectProvidersAtom,
  connectRequestErrorAtom,
  connectStepAtom,
  selectedProviderAtom
} from '@state/ui/connect/index.ts';
import { openModelSurfaceAtom } from '@state/ui/index.ts';
import { backendClientAtom } from '@state/global/index.ts';
import { validateBaseUrl, validateLabel } from '@libs/providers/index.ts';

/** Backend side effects for `/connect`, keeping key material out of atoms. */
export function useConnectBackend(baseUrl: string, label: string) {
  const client = useAtomValue(backendClientAtom);
  const selectedProvider = useAtomValue(selectedProviderAtom);
  const inFlight = useAtomValue(connectInFlightAtom);
  const setProviders = useSetAtom(setConnectProvidersAtom);
  const setStep = useSetAtom(connectStepAtom);
  const setInFlight = useSetAtom(connectInFlightAtom);
  const setOutcome = useSetAtom(connectLastOutcomeAtom);
  const setRequestError = useSetAtom(connectRequestErrorAtom);
  const setBaseUrlError = useSetAtom(customBaseUrlErrorAtom);
  const setLabelError = useSetAtom(customLabelErrorAtom);
  const openModel = useSetAtom(openModelSurfaceAtom);

  const refreshProviders = useCallback(async () => {
    if (client === undefined) {
      setRequestError('Backend unavailable — restart KQode and try /connect again.');
      return;
    }

    try {
      const result = await client.listProviders();
      setProviders(result.providers);
      setRequestError(null);
    } catch {
      setRequestError('Could not read providers — ensure settings storage is available, then retry.');
    }
  }, [client, setProviders, setRequestError]);

  const submitKey = useCallback(
    async (apiKey: string) => {
      if (client === undefined || selectedProvider === null || inFlight) {
        return;
      }

      const params = buildSetKeyParams(selectedProvider.providerId);
      if (params === null) {
        return;
      }

      setInFlight(true);
      setOutcome(null);
      try {
        const result = await client.setProviderKey({ ...params, apiKey });
        setOutcome({ ...result, providerId: selectedProvider.providerId });
        await refreshProviders();
        if (result.outcome === 'connected') {
          openModel();
        }
      } catch {
        setRequestError('Connect failed — ensure the OS keychain is available, then retry.');
      } finally {
        setInFlight(false);
      }
    },
    [client, inFlight, openModel, refreshProviders, selectedProvider, setInFlight, setOutcome, setRequestError]
  );

  const clearProvider = useCallback(async () => {
    if (client === undefined || selectedProvider === null) {
      return;
    }
    setInFlight(true);
    try {
      await client.clearProviderKey(selectedProvider.providerId);
      await refreshProviders();
      setStep(ConnectStep.List);
    } catch {
      setRequestError('Clear failed — ensure the OS keychain is available, then retry.');
    } finally {
      setInFlight(false);
    }
  }, [client, refreshProviders, selectedProvider, setInFlight, setRequestError, setStep]);

  function buildSetKeyParams(providerId: string) {
    if (providerId !== PROVIDER_ID_CUSTOM) {
      return { providerId, baseUrl: KIMI_BASE_URL, label: null };
    }

    const urlResult = validateBaseUrl(baseUrl);
    if (!urlResult.ok) {
      setBaseUrlError(urlResult.message);
      setStep(ConnectStep.CustomUrl);
      return null;
    }
    const labelResult = validateLabel(label);
    if (!labelResult.ok) {
      setLabelError(labelResult.message);
      setStep(ConnectStep.CustomLabel);
      return null;
    }
    return { providerId, baseUrl: urlResult.value, label: labelResult.value };
  }

  return { clearProvider, refreshProviders, submitKey };
}
