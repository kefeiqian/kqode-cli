import { atom } from 'jotai';
import { lastAssistantResponse } from '@libs/promptQueue/lastAssistantResponse.ts';
import { promptQueueAtom } from '@state/promptQueue/store.ts';

/** Derived text of the newest settled assistant response, if one exists. */
export const lastAssistantResponseAtom = atom((get) => lastAssistantResponse(get(promptQueueAtom)));
