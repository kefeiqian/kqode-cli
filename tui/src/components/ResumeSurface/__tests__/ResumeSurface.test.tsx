import { createStore } from 'jotai';
import { useAtomValue } from 'jotai';
import { describe, expect, it, vi } from 'vitest';
import { ResumeSurface } from '@components/ResumeSurface/index.tsx';
import { UserQuestionSurface } from '@components/UserQuestionSurface/index.tsx';
import type { BackendClient } from '@contracts/backend/index.ts';
import { backendClientAtom } from '@state/global/index.ts';
import { workspaceCwdAtom } from '@state/global/workspace.ts';
import { columnsTestOverrideAtom, rowsTestOverrideAtom } from '@state/ui/index.ts';
import { openResumePanelAtom } from '@state/ui/resume/index.ts';
import { promptQueueAtom } from '@state/promptQueue/index.ts';
import { userQuestionAtom } from '@state/ui/userQuestion/index.ts';
import { renderWithJotai } from '@test/renderWithJotai.tsx';
import { memoryBackendStub } from '@test/backendMemoryStub.ts';
import { themeBackendStub } from '@test/backendThemeStub.ts';

function fakeClient(sessions: Awaited<ReturnType<BackendClient['listSessions']>>['sessions']): BackendClient {
  return {
    ...memoryBackendStub(),
    ...themeBackendStub(),
    submit: async () => undefined,
    onTranscriptEvent: () => () => undefined,
    clearConversation: async () => undefined,
    cancelTurn: async () => undefined,
    stopTurn: async () => undefined,
    gitStatus: async () => null,
    listProviders: async () => ({ providers: [] }),
    getActiveSelection: async () => ({ providerId: null, modelId: null }),
    setActiveSelection: async () => undefined,
    clearProviderKey: async () => undefined,
    setProviderKey: async () => ({ outcome: 'unreachable', selectedModel: null }),
    listModels: async () => ({ status: 'failed', models: [] }),
    listSessions: async () => ({ sessions }),
    resumeSession: async () => ({
      sessionId: sessions[0]?.sessionId ?? 'sess-1',
      workspaceCwd: 'C:\\workspace',
      canonicalWorkspaceCwd: 'C:\\workspace',
      turns: []
    })
  };
}

function renderResume(client: BackendClient, columns = 100, rows = 12) {
  const store = createStore();
  store.set(backendClientAtom, client);
  store.set(workspaceCwdAtom, 'C:\\workspace');
  store.set(columnsTestOverrideAtom, columns);
  store.set(rowsTestOverrideAtom, rows);
  store.set(openResumePanelAtom);
  return { store, ...renderWithJotai(<ResumeSurface />, store) };
}

function renderResumeHarness(client: BackendClient, store = createStore(), columns = 100, rows = 12) {
  store.set(backendClientAtom, client);
  store.set(workspaceCwdAtom, 'C:\\workspace');
  store.set(columnsTestOverrideAtom, columns);
  store.set(rowsTestOverrideAtom, rows);
  store.set(openResumePanelAtom);
  return { store, ...renderWithJotai(<ResumeQuestionHarness />, store) };
}

function ResumeQuestionHarness() {
  const question = useAtomValue(userQuestionAtom);
  return question === null ? <ResumeSurface /> : <UserQuestionSurface />;
}

async function waitForFrame(lastFrame: () => string | undefined, text: string) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const frame = lastFrame() ?? '';
    if (frame.includes(text)) {
      return frame;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`Timed out waiting for ${text}. Last frame:\n${lastFrame() ?? ''}`);
}

describe('ResumeSurface', () => {
  it('renders the session table rows once sessions load', async () => {
    const { lastFrame } = renderResume(
      fakeClient([
        {
          sessionId: 'sess-1',
          summary: 'hello world',
          status: 'Current',
          modifiedAt: Date.now(),
          createdAt: Date.now(),
          folder: 'C:\\workspace'
        }
      ])
    );

    const frame = await waitForFrame(lastFrame, 'hello world');
    expect(frame).toContain('Resume Session:');
    expect(frame).toContain('─'.repeat(99));
    expect(frame).toContain('Summary');
    expect(frame).toContain('Current');
  });

  it('shows the empty state when no saved sessions exist', async () => {
    const { lastFrame } = renderResume(fakeClient([]));
    expect(await waitForFrame(lastFrame, 'No saved local sessions yet.')).toContain(
      'Submit your first prompt to create one.'
    );
  });

  it('caps session rows and scrolls the highlighted row within the panel', async () => {
    const sessions = Array.from({ length: 15 }, (_, index) => ({
      sessionId: `sess-${index}`,
      summary: `session ${index}`,
      status: 'Idle' as const,
      modifiedAt: Date.now() - index,
      createdAt: Date.now() - index,
      folder: `C:\\workspace\\${index}`
    }));
    const view = renderResume(fakeClient(sessions), 100, 20);

    await waitForFrame(view.lastFrame, 'session 0');
    for (let index = 0; index < 11; index += 1) {
      view.stdin.write('\u001B[B');
    }

    const frame = await waitForFrame(view.lastFrame, 'session 11');
    expect(frame).not.toContain('session 0');
    expect(frame).toContain('session 11');
    expect(frame).toContain('more ↑↓');
  });

  it('asks before stopping an in-flight turn and resuming another session', async () => {
    const store = createStore();
    const stopTurn = vi.fn(async () => {
      store.set(promptQueueAtom, []);
    });
    const resumeSession = vi.fn(async () => ({
      sessionId: 'sess-1',
      workspaceCwd: 'C:\\workspace',
      canonicalWorkspaceCwd: 'C:\\workspace',
      turns: []
    }));
    const client = {
      ...fakeClient([
        {
          sessionId: 'sess-1',
          summary: 'target session',
          status: 'Idle',
          modifiedAt: Date.now(),
          createdAt: Date.now(),
          folder: 'C:\\workspace'
        }
      ]),
      stopTurn,
      resumeSession,
      relaunch: async () => undefined
    };
    store.set(promptQueueAtom, [
      { id: 1, turnId: 'turn-running', text: 'running', state: 'active' }
    ]);
    const view = renderResumeHarness(client, store);

    await waitForFrame(view.lastFrame, 'target session');
    view.stdin.write('\r');
    await waitForFrame(view.lastFrame, 'Switch sessions?');
    expect(stopTurn).not.toHaveBeenCalled();

    view.stdin.write('y');
    await waitFor(() => expect(resumeSession).toHaveBeenCalledWith({ sessionId: 'sess-1' }));
    expect(stopTurn).toHaveBeenCalledTimes(1);
  });

  it('asks before resuming a session from another folder', async () => {
    const store = createStore();
    store.set(workspaceCwdAtom, 'C:\\workspace-a');
    const resumeSession = vi.fn(async () => ({
      sessionId: 'sess-1',
      workspaceCwd: 'C:\\workspace-b',
      canonicalWorkspaceCwd: 'C:\\workspace-b',
      turns: []
    }));
    const client = {
      ...fakeClient([
        {
          sessionId: 'sess-1',
          summary: 'other folder session',
          status: 'Idle',
          modifiedAt: Date.now(),
          createdAt: Date.now(),
          folder: 'C:\\workspace-b'
        }
      ]),
      resumeSession,
      relaunch: async () => undefined
    };
    const view = renderResumeHarness(client, store);

    await waitForFrame(view.lastFrame, 'other folder session');
    view.stdin.write('\r');
    await waitForFrame(view.lastFrame, 'Resume from another folder?');
    expect(resumeSession).not.toHaveBeenCalled();

    view.stdin.write('y');
    await waitFor(() => expect(resumeSession).toHaveBeenCalledWith({ sessionId: 'sess-1' }));
  });
});

async function waitFor(assertion: () => void) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }
  assertion();
}
