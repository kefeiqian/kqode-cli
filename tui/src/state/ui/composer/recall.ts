import { atom } from 'jotai';
import {
  appendRecallEntry,
  createRecallRing,
  recallNext,
  recallPrevious
} from '@libs/composer/recallRing.ts';
import type { CapturedSubmit } from '@libs/composer/submitCapture.ts';

const recallRingAtom = atom(createRecallRing());

/** Appends one captured composer submit to the session-local recall ring. */
export const appendComposerRecallSubmitAtom = atom(null, (_get, set, submit: CapturedSubmit) => {
  set(recallRingAtom, (ring) => appendRecallEntry(ring, submit.text));
});

/** Recalls the previous submitted line, saving `draft` only on first recall. */
export const recallPreviousComposerSubmitAtom = atom(null, (get, set, draft: string) => {
  const result = recallPrevious(get(recallRingAtom), draft);
  set(recallRingAtom, result.ring);
  return result.text;
});

/** Recalls the next submitted line, or restores the saved draft past newest. */
export const recallNextComposerSubmitAtom = atom(null, (get, set) => {
  const result = recallNext(get(recallRingAtom));
  set(recallRingAtom, result.ring);
  return result.text;
});
