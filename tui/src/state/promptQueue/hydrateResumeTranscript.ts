import type { ResumedTurn } from '@contracts/backend/index.ts';
import type { TranscriptReducerState } from '@libs/promptQueue/transcriptReducer.ts';
import { turnResultToBackendResult } from '@libs/promptQueue/promptQueue.ts';

/**
 * Builds the prompt-queue reducer snapshot for a restored durable session.
 *
 * Restored turns are always rendered as settled history rows; any interrupted
 * state is already encoded in the resumed turn result payload.
 *
 * Each turn is stamped with a negative `submissionSequence` (`index - turns.length`,
 * i.e. `[-turns.length, -1]`) so `composeTranscriptRows` sorts the restored
 * history ahead of every prompt submitted after the resume — composer-minted
 * sequences start at `0`, so any new prompt renders below the resumed transcript
 * while the resumed turns keep their original order.
 */
export function hydrateResumeTranscript(
  turns: readonly ResumedTurn[],
  generation: number
): TranscriptReducerState {
  return {
    queue: turns.map((turn, index) => ({
      id: index,
      turnId: turn.turnId,
      submissionSequence: index - turns.length,
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
