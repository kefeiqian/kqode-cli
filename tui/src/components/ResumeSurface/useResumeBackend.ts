import { useAtomValue, useSetAtom, useStore } from 'jotai';
import { useCallback } from 'react';
import { backendClientAtom } from '@state/global/index.ts';
import { hydrateResumedTranscriptAtom } from '@state/promptQueue/atoms.ts';
import { turnInFlightAtom } from '@state/promptQueue/store.ts';
import {
  closeResumePanelAtom,
  resetResumeSurfaceAtom,
  setResumeFailureAtom,
  setResumeResumingAtom,
  setResumeRowsAtom
} from '@state/ui/resume/index.ts';
import { backendErrorMessage } from '@libs/promptQueue/promptQueue.ts';
import { resumeSessionById } from '@backend/runtime/sessionResume.ts';
import { setSessionWindowTitle } from '@libs/terminal/windowTitle.ts';
import { PRODUCT_NAME } from '@constants/product.ts';
import type { RuntimeBackendClient } from '@backend/runtime/backendRuntime.ts';

function isRuntimeBackendClient(client: unknown): client is RuntimeBackendClient {
  return typeof client === 'object' && client !== null && 'relaunch' in client;
}

export function useResumeBackend() {
  const client = useAtomValue(backendClientAtom);
  const store = useStore();
  const resetResume = useSetAtom(resetResumeSurfaceAtom);
  const setResumeRows = useSetAtom(setResumeRowsAtom);
  const setResumeFailure = useSetAtom(setResumeFailureAtom);
  const setResumeResuming = useSetAtom(setResumeResumingAtom);
  const hydrateResumedTranscript = useSetAtom(hydrateResumedTranscriptAtom);
  const closeResumePanel = useSetAtom(closeResumePanelAtom);

  const refreshSessions = useCallback(async () => {
    resetResume();
    if (client === undefined) {
      setResumeFailure('Rust backend unavailable');
      return;
    }
    try {
      const result = await client.listSessions();
      setResumeRows(result.sessions);
    } catch (error) {
      setResumeFailure(backendErrorMessage(error));
    }
  }, [client, resetResume, setResumeFailure, setResumeRows]);

  const resumeSelected = useCallback(
    async (sessionId: string) => {
      if (!isRuntimeBackendClient(client)) {
        setResumeFailure('Rust backend unavailable');
        return;
      }
      if (store.get(turnInFlightAtom)) {
        setResumeFailure('Finish or cancel the current turn before switching sessions.');
        return;
      }
      setResumeResuming();
      try {
        const { resumed, session } = await resumeSessionById({ store, client, sessionId });
        hydrateResumedTranscript(resumed);
        setSessionWindowTitle(PRODUCT_NAME, session.summary);
        closeResumePanel();
      } catch (error) {
        setResumeFailure(backendErrorMessage(error));
      }
    },
    [
      client,
      closeResumePanel,
      hydrateResumedTranscript,
      setResumeFailure,
      setResumeResuming,
      store
    ]
  );

  return { refreshSessions, resumeSelected };
}
