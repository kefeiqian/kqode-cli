import { atom } from 'jotai';
import { DEFAULT_BODY_ENTRIES } from '@libs/tui/bodyRows.ts';
import type { BodyEntry } from '@libs/tui/bodyRows.ts';
import { queueToBodyEntries } from '@libs/promptQueue/promptQueue.ts';
import { promptQueueAtom } from '@state/promptQueue/store.ts';

export const bodyEntriesAtom = atom<readonly BodyEntry[] | undefined>(undefined);

/** Transcript body rows derived from the prompt queue. */
export const submittedPromptEntriesAtom = atom((get) =>
  queueToBodyEntries(get(promptQueueAtom))
);

export const displayedBodyEntriesAtom = atom((get) => {
  const submittedPromptEntries = get(submittedPromptEntriesAtom);
  const baseBodyEntries = get(bodyEntriesAtom) ?? DEFAULT_BODY_ENTRIES;

  return submittedPromptEntries.length === 0
    ? baseBodyEntries
    : [...baseBodyEntries, ...submittedPromptEntries];
});
