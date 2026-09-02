import { useAtomValue, useSetAtom, useStore } from 'jotai';
import { useCallback } from 'react';
import { backendClientAtom, workspaceCwdAtom } from '@state/global/index.ts';
import { turnInFlightAtom } from '@state/promptQueue/store.ts';
import {
  closeResumePanelAtom,
  resetResumeSurfaceAtom,
  resumeSessionsAtom,
  setResumeFailureAtom,
  setResumeResumingAtom,
  setResumeRowsAtom
} from '@state/ui/resume/index.ts';
import { openUserQuestionAtom, type UserQuestion } from '@state/ui/userQuestion/index.ts';
import { backendErrorMessage } from '@libs/promptQueue/promptQueue.ts';
import {
  applyResolvedResumeSession,
  resumeSessionById
} from '@backend/runtime/sessionResume.ts';
import type { RuntimeBackendClient } from '@backend/runtime/backendRuntime.ts';

const WAIT_FOR_STOP_IDLE_TIMEOUT_MS = 5_000;
const WAIT_FOR_STOP_IDLE_POLL_MS = 25;

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
  const closeResumePanel = useSetAtom(closeResumePanelAtom);
  const openQuestion = useSetAtom(openUserQuestionAtom);

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
        openQuestion({
          title: 'Switch sessions?',
          message: 'A turn is still running. Stop it and resume the selected session?',
          choices: [
            {
              id: 'stop-and-resume',
              label: 'Stop turn and resume',
              shortcut: 'y',
              action: () =>
                stopAndResume({
                  client,
                  sessionId,
                  store,
                  openQuestion,
                  setResumeFailure,
                  setResumeResuming,
                  closeResumePanel
                })
            },
            {
              id: 'stay',
              label: 'Stay in current session',
              shortcut: 'n',
              isCancel: true,
              action: () => undefined
            }
          ],
          footerHint: 'y stop/resume · n/Esc stay'
        });
        return;
      }
      confirmWorkspaceOrResume({
        client,
        sessionId,
        store,
        openQuestion,
        setResumeFailure,
        setResumeResuming,
        closeResumePanel
      });
    },
    [
      client,
      closeResumePanel,
      openQuestion,
      setResumeFailure,
      setResumeResuming,
      store
    ]
  );

  return { refreshSessions, resumeSelected };
}

type ResumeActionDeps = {
  client: RuntimeBackendClient;
  sessionId: string;
  store: ReturnType<typeof useStore>;
  openQuestion: (question: UserQuestion) => void;
  setResumeFailure: (message: string) => void;
  setResumeResuming: () => void;
  closeResumePanel: () => void;
};

async function stopAndResume(deps: ResumeActionDeps): Promise<void> {
  const { client, setResumeFailure, setResumeResuming, store } = deps;
  setResumeResuming();
  try {
    await client.stopTurn();
    await waitForTurnIdle(store);
    confirmWorkspaceOrResume(deps);
  } catch (error) {
    setResumeFailure(backendErrorMessage(error));
  }
}

function confirmWorkspaceOrResume(deps: ResumeActionDeps): void {
  const { closeResumePanel, openQuestion, sessionId, store } = deps;
  const target = store
    .get(resumeSessionsAtom)
    .find((session) => session.sessionId === sessionId);
  const currentFolder = store.get(workspaceCwdAtom);
  if (
    target === undefined ||
    currentFolder === '' ||
    target.folder === currentFolder
  ) {
    void performResume(deps);
    return;
  }

  openQuestion({
    title: 'Resume from another folder?',
    message: `Current: ${currentFolder}  Target: ${target.folder}`,
    choices: [
      {
        id: 'switch-folder',
        label: 'Switch folder and resume',
        shortcut: 'y',
        action: () => performResume(deps)
      },
      {
        id: 'stay',
        label: 'Stay in current folder',
        shortcut: 'n',
        isCancel: true,
        action: closeResumePanel
      }
    ],
    footerHint: 'y switch/resume · n/Esc stay'
  });
}

async function performResume({
  client,
  sessionId,
  store,
  setResumeFailure,
  setResumeResuming,
  closeResumePanel
}: ResumeActionDeps): Promise<void> {
  setResumeResuming();
  try {
    const result = await resumeSessionById({ store, client, sessionId });
    applyResolvedResumeSession({ store, ...result });
    closeResumePanel();
  } catch (error) {
    setResumeFailure(backendErrorMessage(error));
  }
}

async function waitForTurnIdle(store: ReturnType<typeof useStore>): Promise<void> {
  const started = Date.now();
  while (store.get(turnInFlightAtom)) {
    if (Date.now() - started > WAIT_FOR_STOP_IDLE_TIMEOUT_MS) {
      throw new Error('timed out waiting for the running turn to stop');
    }
    await new Promise((resolve) => setTimeout(resolve, WAIT_FOR_STOP_IDLE_POLL_MS));
  }
}
