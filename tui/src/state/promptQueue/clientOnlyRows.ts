import { atom } from 'jotai';
import type { Getter, Setter } from 'jotai';
import { BodyEntryKind } from '@constants/bodyEntry.ts';
import { unknownCommandMessage } from '@libs/commands/unknownCommand.ts';
import { bodyScrollOffsetRowsAtom } from '@state/ui/index.ts';
import {
  clientOnlyRowsAtom,
  nextClientOnlyRowIdAtom,
  nextSubmissionSequenceAtom
} from '@state/promptQueue/store.ts';

type SequencedText = string | { text: string; submissionSequence: number };

/** Appends a client-owned error row outside the backend transcript mirror. */
export function appendClientOnlyError(
  get: Getter,
  set: Setter,
  submissionSequence: number,
  text: string
): void {
  const id = get(nextClientOnlyRowIdAtom);
  set(clientOnlyRowsAtom, (rows) => [
    ...rows,
    { id, submissionSequence, kind: BodyEntryKind.Error, text }
  ]);
  set(nextClientOnlyRowIdAtom, id + 1);
}

/** Appends a client-owned startup/runtime error row using the next local sequence. */
export const appendClientOnlyErrorAtom = atom(null, (get, set, text: string) => {
  const submissionSequence = get(nextSubmissionSequenceAtom);
  set(nextSubmissionSequenceAtom, submissionSequence + 1);
  appendClientOnlyError(get, set, submissionSequence, text);
  set(bodyScrollOffsetRowsAtom, 0);
});

/** Adds an unknown-command notice row without creating a backend turn. */
export const appendUnknownCommandNoticeAtom = atom(null, (get, set, input: SequencedText) => {
  const { text, submissionSequence } = sequencedText(get, set, input);
  appendClientOnlyError(get, set, submissionSequence, unknownCommandMessage(text));
  set(bodyScrollOffsetRowsAtom, 0);
});

/** Assigns a fallback sequence for direct atom callers that bypass capture. */
export function sequencedText(get: Getter, set: Setter, input: SequencedText) {
  if (typeof input !== 'string') {
    return input;
  }
  const submissionSequence = get(nextSubmissionSequenceAtom);
  set(nextSubmissionSequenceAtom, submissionSequence + 1);
  return { text: input, submissionSequence };
}
