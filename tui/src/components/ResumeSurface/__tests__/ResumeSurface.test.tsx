import { createStore } from 'jotai';
import { describe, expect, it } from 'vitest';
import { ResumeSurface } from '@components/ResumeSurface/index.tsx';
import type { BackendClient } from '@contracts/backend/index.ts';
import { backendClientAtom } from '@state/global/index.ts';
import { activeSurfaceAtom, columnsTestOverrideAtom, rowsTestOverrideAtom, Surface } from '@state/ui/index.ts';
import { renderWithJotai } from '@test/renderWithJotai.tsx';

function fakeClient(sessions: Awaited<ReturnType<BackendClient['listSessions']>>['sessions']): BackendClient {
  return {
    submit: async () => undefined,
    onTranscriptEvent: () => () => undefined,
    clearConversation: async () => undefined,
    cancelTurn: async () => undefined,
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
  store.set(activeSurfaceAtom, Surface.Resume);
  store.set(backendClientAtom, client);
  store.set(columnsTestOverrideAtom, columns);
  store.set(rowsTestOverrideAtom, rows);
  return { store, ...renderWithJotai(<ResumeSurface />, store) };
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
    expect(frame).toContain('/resume');
    expect(frame).toContain('Summary');
    expect(frame).toContain('Current');
  });

  it('shows the empty state when no saved sessions exist', async () => {
    const { lastFrame } = renderResume(fakeClient([]));
    expect(await waitForFrame(lastFrame, 'No saved local sessions yet.')).toContain(
      'Submit your first prompt to create one.'
    );
  });
});
