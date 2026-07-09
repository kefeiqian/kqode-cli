import { useAtomValue, useSetAtom } from 'jotai';
import { useCallback } from 'react';
import { KIMI_BASE_URL, LoginStep, PROVIDER_ID_CUSTOM } from '@state/ui/login/index.ts';
import {
  customBaseUrlErrorAtom,
  customLabelErrorAtom,
  loginInFlightAtom,
  loginLastOutcomeAtom,
  loginProvidersAtom,
  loginRequestErrorAtom,
  loginSelectedIndexAtom,
  loginStepAtom,
  selectedProviderAtom
} from '@state/ui/login/index.ts';
import { closeActiveSurfaceAtom } from '@state/ui/index.ts';
import { backendClientAtom } from '@state/global/index.ts';
import { validateBaseUrl, validateLabel } from '@libs/providers/index.ts';

/** Backend side effects for `/login`, keeping key material out of atoms. */
export function useLoginBackend(baseUrl: string, label: string) {
  const client = useAtomValue(backendClientAtom);
  const selectedProvider = useAtomValue(selectedProviderAtom);
  const inFlight = useAtomValue(loginInFlightAtom);
  const setProviders = useSetAtom(loginProvidersAtom);
  const setSelectedIndex = useSetAtom(loginSelectedIndexAtom);
  const setStep = useSetAtom(loginStepAtom);
  const setInFlight = useSetAtom(loginInFlightAtom);
  const setOutcome = useSetAtom(loginLastOutcomeAtom);
  const setRequestError = useSetAtom(loginRequestErrorAtom);
  const setBaseUrlError = useSetAtom(customBaseUrlErrorAtom);
  const setLabelError = useSetAtom(customLabelErrorAtom);
  const closeActiveSurface = useSetAtom(closeActiveSurfaceAtom);

  const refreshProviders = useCallback(async () => {
    if (client === undefined) {
      setRequestError('Backend unavailable — restart KQode and try /login again.');
      return;
    }

    try {
      const result = await client.listProviders();
      setProviders(result.providers);
      setSelectedIndex((current) => Math.min(current, Math.max(0, result.providers.length - 1)));
      setRequestError(null);
    } catch {
      setRequestError('Could not read providers — ensure settings storage is available, then retry.');
    }
  }, [client, setProviders, setRequestError, setSelectedIndex]);

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
          closeActiveSurface();
        }
      } catch {
        setRequestError('Login failed — ensure the OS keychain is available, then retry.');
      } finally {
        setInFlight(false);
      }
    },
    [client, closeActiveSurface, inFlight, refreshProviders, selectedProvider, setInFlight, setOutcome, setRequestError]
  );

  const clearProvider = useCallback(async () => {
    if (client === undefined || selectedProvider === null) {
      return;
    }
    setInFlight(true);
    try {
      await client.clearProviderKey(selectedProvider.providerId);
      await refreshProviders();
      setStep(LoginStep.List);
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
      setStep(LoginStep.CustomUrl);
      return null;
    }
    const labelResult = validateLabel(label);
    if (!labelResult.ok) {
      setLabelError(labelResult.message);
      setStep(LoginStep.CustomLabel);
      return null;
    }
    return { providerId, baseUrl: urlResult.value, label: labelResult.value };
  }

  return { clearProvider, refreshProviders, submitKey };
}
