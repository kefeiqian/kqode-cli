import { Text } from 'ink';
import { createStore } from 'jotai';
import { useAtomValue } from 'jotai';
import { memoryBackendStub } from '@test/backendMemoryStub.ts';
import { themeBackendStub } from '@test/backendThemeStub.ts';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { usePromptComposerInput } from '@components/PromptComposer/usePromptComposerInput.ts';
import { ArmedAction } from '@constants/ui.ts';
import { BodyEntryKind } from '@constants/bodyEntry.ts';
import { SETTLED_KIND_CANCELLED, TURN_STATE_PENDING } from '@contracts/backend/index.ts';
import type { BackendClient } from '@contracts/backend/index.ts';
import type { CommandActions } from '@libs/commands/executeCommand.ts';
import { PROMPT_MAX_BYTES } from '@libs/composer/promptText.ts';
import { backendClientAtom } from '@state/global/index.ts';
import { promptQueueAtom, transcriptEventAtom } from '@state/promptQueue/index.ts';
import { commandMenuDismissedAtom } from '@state/ui/commands/index.ts';
import { armedActionAtom, submittedPromptEntriesAtom } from '@state/ui/index.ts';
import { composerStateAtom } from '@state/ui/composer/index.ts';
import { renderWithJotai } from '@test/renderWithJotai.tsx';

const ESC = '\u001B';
const ESC_PARSE_MS = 80;

const commandActions: CommandActions = {
  exit: vi.fn(),
  clearTranscript: vi.fn(),
  showHelp: vi.fn(),
  openLogin: vi.fn(),
  openModel: vi.fn(),
  openResume: vi.fn(),
  openMemory: vi.fn(),
  openMemoryAdd: vi.fn(),
  openMemoryEdit: vi.fn(),
  openTheme: vi.fn()
};

function clientWithCancel(cancelTurn: BackendClient['cancelTurn']): BackendClient {
  return {
    ...memoryBackendStub(),
    ...themeBackendStub(),
    submit: async () => undefined,
    onTranscriptEvent: () => () => undefined,
    clearConversation: async () => undefined,
    cancelTurn,
    gitStatus: async () => null,
    listProviders: async () => ({ providers: [] }),
    getActiveSelection: async () => ({ providerId: null, modelId: null }),
    setActiveSelection: async () => undefined,
    clearProviderKey: async () => undefined,
    setProviderKey: async () => ({ outcome: 'unreachable', selectedModel: null }),
    listModels: async () => ({ status: 'failed', models: [] }),
    listSessions: async () => ({ sessions: [] }),
    resumeSession: async () => ({
      sessionId: 'sess-1',
      workspaceCwd: 'C:\\workspace',
      canonicalWorkspaceCwd: 'C:\\workspace',
      turns: []
    })
  };
}

function InputHarness(): ReactElement {
  const composerState = useAtomValue(composerStateAtom);
  usePromptComposerInput({
    isActive: true,
    maxBytes: PROMPT_MAX_BYTES,
    onSubmit: vi.fn(),
    state: composerState,
    commandActions
  });
  return <Text>input harness</Text>;
}

async function writeEsc(stdin: { write(input: string): void }): Promise<void> {
  stdin.write(ESC);
  await new Promise((resolve) => setTimeout(resolve, ESC_PARSE_MS));
}

describe('usePromptComposerInput Esc cancellation', () => {
  it('cancels the active turn and lets settled(cancelled) render before the next turn activates', async () => {
    const store = createStore();
    const cancelTurn = vi.fn(async () => undefined);
    store.set(backendClientAtom, clientWithCancel(cancelTurn));
    store.set(composerStateAtom, { text: 'draft text', cursorIndex: 10, validationError: null });
    store.set(promptQueueAtom, [
      { id: 0, turnId: 'turn-active', text: 'running', state: 'active' },
      { id: 1, turnId: 'turn-next', text: 'next', state: 'queued' }
    ]);
    const { stdin } = renderWithJotai(<InputHarness />, store);

    await writeEsc(stdin);

    expect(cancelTurn).toHaveBeenCalledWith('turn-active');
    expect(store.get(armedActionAtom)).toBeNull();

    store.set(transcriptEventAtom, {
      type: 'settled',
      turnId: 'turn-active',
      result: {
        kind: SETTLED_KIND_CANCELLED,
        text: null,
        finishReason: null,
        errorKind: null,
        message: null
      }
    });
    store.set(transcriptEventAtom, { type: 'activated', turnId: 'turn-next' });

    expect(store.get(promptQueueAtom).map((item) => item.state)).toEqual(['settled', 'active']);
    expect(store.get(submittedPromptEntriesAtom)).toContainEqual(
      expect.objectContaining({ kind: BodyEntryKind.Muted, text: 'Cancelled' })
    );
  });

  it('lets open slash-menu Esc dismissal win without cancelling the active turn', async () => {
    const store = createStore();
    const cancelTurn = vi.fn(async () => undefined);
    store.set(backendClientAtom, clientWithCancel(cancelTurn));
    store.set(composerStateAtom, { text: '/help', cursorIndex: 5, validationError: null });
    store.set(promptQueueAtom, [{ id: 0, turnId: 'turn-active', text: 'running', state: 'active' }]);
    const { stdin } = renderWithJotai(<InputHarness />, store);

    await writeEsc(stdin);

    expect(store.get(commandMenuDismissedAtom)).toBe(true);
    expect(cancelTurn).not.toHaveBeenCalled();
  });

  it('falls through to armed-clear when Esc has no active turn to cancel', async () => {
    const store = createStore();
    const cancelTurn = vi.fn(async () => undefined);
    store.set(backendClientAtom, clientWithCancel(cancelTurn));
    store.set(composerStateAtom, { text: 'hello', cursorIndex: 5, validationError: null });
    store.set(promptQueueAtom, [
      { id: 0, turnId: 'turn-waiting', text: 'waiting', state: 'queued' }
    ]);
    const { stdin } = renderWithJotai(<InputHarness />, store);

    await writeEsc(stdin);

    expect(cancelTurn).not.toHaveBeenCalled();
    expect(store.get(armedActionAtom)).toBe(ArmedAction.ClearInput);
  });

  it('still avoids cancelling while an enqueued pending slash command keeps the menu open', async () => {
    const store = createStore();
    const cancelTurn = vi.fn(async () => undefined);
    store.set(backendClientAtom, clientWithCancel(cancelTurn));
    store.set(composerStateAtom, { text: '/unknown', cursorIndex: 8, validationError: null });
    store.set(promptQueueAtom, [
      { id: 0, turnId: 'turn-active', text: 'running', state: 'active' }
    ]);
    store.set(transcriptEventAtom, {
      type: 'enqueued',
      turnId: 'turn-queued',
      seq: 2,
      state: TURN_STATE_PENDING
    });
    const { stdin } = renderWithJotai(<InputHarness />, store);

    await writeEsc(stdin);

    expect(store.get(commandMenuDismissedAtom)).toBe(true);
    expect(cancelTurn).not.toHaveBeenCalled();
  });
});
