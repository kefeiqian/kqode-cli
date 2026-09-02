import { createStore } from 'jotai';
import { describe, expect, it } from 'vitest';
import { SETTLED_KIND_COMPLETED, SETTLED_KIND_ERROR } from '@contracts/backend/index.ts';
import type { ResumedTurn } from '@contracts/backend/index.ts';
import { hydrateResumedTranscriptAtom } from '@state/promptQueue/atoms.ts';
import { hydrateResumeTranscript } from '@state/promptQueue/hydrateResumeTranscript.ts';
import { composeTranscriptRows } from '@libs/promptQueue/rowComposition.ts';
import type { QueueItem } from '@libs/promptQueue/promptQueue.ts';
import {
  clientOnlyRowsAtom,
  conversationGenerationAtom,
  promptQueueAtom,
  settledTurnIdsAtom,
  streamingTextByIdAtom,
  turnGenerationByIdAtom
} from '@state/promptQueue/store.ts';

function completedTurn(turnId: string, seq: number, prompt: string, answer: string): ResumedTurn {
  return {
    turnId,
    seq,
    prompt,
    result: {
      kind: SETTLED_KIND_COMPLETED,
      text: answer,
      finishReason: 'stop',
      errorKind: null,
      message: null
    }
  };
}

describe('hydrateResumedTranscriptAtom', () => {
  it('replaces the prompt queue with settled resumed turns and clears transient state', () => {
    const store = createStore();
    store.set(conversationGenerationAtom, 4);
    store.set(clientOnlyRowsAtom, [{ id: 1, submissionSequence: 0, kind: 'error', text: 'stale' }]);
    store.set(streamingTextByIdAtom, new Map([[0, 'partial']]));

    store.set(hydrateResumedTranscriptAtom, {
      sessionId: 'sess-1',
      workspaceCwd: 'C:\\workspace',
      canonicalWorkspaceCwd: 'C:\\workspace',
      turns: [
        {
          turnId: 'turn-1',
          seq: 0,
          prompt: 'hello',
          result: {
            kind: SETTLED_KIND_COMPLETED,
            text: 'done',
            finishReason: 'stop',
            errorKind: null,
            message: null
          }
        },
        {
          turnId: 'turn-2',
          seq: 1,
          prompt: 'oops',
          result: {
            kind: SETTLED_KIND_ERROR,
            text: null,
            finishReason: null,
            errorKind: 'interrupted',
            message: 'turn interrupted before resume'
          }
        }
      ]
    });

    expect(store.get(conversationGenerationAtom)).toBe(5);
    expect(store.get(promptQueueAtom)).toEqual([
      expect.objectContaining({
        id: 0,
        turnId: 'turn-1',
        text: 'hello',
        state: 'settled',
        result: { kind: 'assistant', text: 'done' }
      }),
      expect.objectContaining({
        id: 1,
        turnId: 'turn-2',
        text: 'oops',
        state: 'settled',
        result: { kind: 'error', text: 'turn interrupted before resume' }
      })
    ]);
    expect(store.get(clientOnlyRowsAtom)).toEqual([]);
    expect(store.get(streamingTextByIdAtom).size).toBe(0);
    expect(store.get(settledTurnIdsAtom)).toEqual(new Set(['turn-1', 'turn-2']));
    expect(store.get(turnGenerationByIdAtom)).toEqual(
      new Map([
        ['turn-1', 5],
        ['turn-2', 5]
      ])
    );
  });
});

describe('hydrateResumeTranscript ordering', () => {
  it('keeps resumed turns above prompts submitted after the resume', () => {
    const hydrated = hydrateResumeTranscript(
      [
        completedTurn('turn-1', 0, 'can you explain Bayes theorem?', 'Bayes describes...'),
        completedTurn('turn-2', 1, 'a follow-up', 'sure...')
      ],
      1
    );

    // A prompt typed after the resume gets the lowest composer sequence (0).
    const newPrompt: QueueItem = {
      id: hydrated.nextQueueItemId,
      turnId: 'local-turn-0',
      submissionSequence: 0,
      text: 'how to remember?',
      state: 'active'
    };

    const rows = composeTranscriptRows([...hydrated.queue, newPrompt], []);
    const texts = rows.map((row) => row.text);

    expect(texts.indexOf('how to remember?')).toBeGreaterThan(
      texts.indexOf('can you explain Bayes theorem?')
    );
    expect(texts.indexOf('how to remember?')).toBeGreaterThan(texts.indexOf('a follow-up'));
  });
});
