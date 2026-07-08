import type { ResumedTurn } from '@contracts/backend/index.ts';
import type { TranscriptReducerState } from '@libs/promptQueue/transcriptReducer.ts';
import { turnResultToBackendResult } from '@libs/promptQueue/promptQueue.ts';

/**
 * Builds the prompt-queue reducer snapshot for a restored durable session.
 *
 * Restored turns are always rendered as settled history rows; any interrupted
 * state is already encoded in the resumed turn result payload.
 */
export function hydrateResumeTranscript(
  turns: readonly ResumedTurn[],
  generation: number
): TranscriptReducerState {
  return {
    queue: turns.map((turn, index) => ({
      id: index,
      turnId: turn.turnId,
      text: turn.prompt,
      state: 'settled' as const,
      result: turnResultToBackendResult(turn.result)
    })),
    streamingTextById: new Map(),
    generationByTurnId: new Map(turns.map((turn) => [turn.turnId, generation])),
    settledTurnIds: new Set(turns.map((turn) => turn.turnId)),
    nextQueueItemId: turns.length
  };
}
