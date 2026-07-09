import { useAtomValue, useSetAtom } from 'jotai';
import { useCallback } from 'react';
import { SET_KEY_OUTCOME_CONNECTED } from '@contracts/backend/providerMessages.ts';
import { backendClientAtom } from '@state/global/index.ts';
import { KIMI_BASE_URL } from '@state/ui/connect/index.ts';
import {
  inlineConnectInFlightAtom,
  inlineConnectOutcomeAtom,
  inlineConnectProviderIdAtom,
  inlineConnectRequestErrorAtom
} from '@state/ui/model/index.ts';

/** Drives preset key validation from `/model` without storing the key in atoms. */
export function useInlineConnect(refreshModels: () => Promise<void>) {
  const client = useAtomValue(backendClientAtom);
  const providerId = useAtomValue(inlineConnectProviderIdAtom);
  const inFlight = useAtomValue(inlineConnectInFlightAtom);
  const setProviderId = useSetAtom(inlineConnectProviderIdAtom);
  const setInFlight = useSetAtom(inlineConnectInFlightAtom);
  const setOutcome = useSetAtom(inlineConnectOutcomeAtom);
  const setRequestError = useSetAtom(inlineConnectRequestErrorAtom);

  const startInlineConnect = useCallback(
    (nextProviderId: string) => {
      if (inFlight) {
        return;
      }
      setProviderId(nextProviderId);
      setOutcome(null);
      setRequestError(null);
    },
    [inFlight, setOutcome, setProviderId, setRequestError]
  );

  const cancelInlineConnect = useCallback(() => {
    if (inFlight) {
      return;
    }
    setProviderId(null);
    setOutcome(null);
    setRequestError(null);
  }, [inFlight, setOutcome, setProviderId, setRequestError]);

  const submitInlineKey = useCallback(
    async (apiKey: string) => {
      if (client === undefined || providerId === null || inFlight) {
        return;
      }
      setInFlight(true);
      setOutcome(null);
      setRequestError(null);
      try {
        const result = await client.setProviderKey({
          providerId,
          baseUrl: KIMI_BASE_URL,
          label: null,
          apiKey
        });
        setOutcome(result.outcome);
        if (result.outcome === SET_KEY_OUTCOME_CONNECTED) {
          setProviderId(null);
          setOutcome(null);
          await refreshModels();
        }
      } catch {
        setRequestError('Connect failed — ensure the OS keychain is available, then retry.');
      } finally {
        setInFlight(false);
      }
    },
    [client, inFlight, providerId, refreshModels, setInFlight, setOutcome, setProviderId, setRequestError]
  );

  return { cancelInlineConnect, startInlineConnect, submitInlineKey };
}
