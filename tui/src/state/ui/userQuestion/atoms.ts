import { atom } from 'jotai';
import { clamp } from '@libs/math/clamp.ts';

export type UserQuestionChoice = {
  id: string;
  label: string;
  shortcut?: string;
  isCancel?: boolean;
  action: () => void | Promise<void>;
};

export type UserQuestion = {
  title: string;
  message: string;
  choices: readonly UserQuestionChoice[];
  footerHint?: string;
};

export const userQuestionAtom = atom<UserQuestion | null>(null);
export const userQuestionSelectedIndexAtom = atom(0);

export const openUserQuestionAtom = atom(null, (_get, set, question: UserQuestion) => {
  set(userQuestionAtom, question);
  set(userQuestionSelectedIndexAtom, 0);
});

export const closeUserQuestionAtom = atom(null, (_get, set) => {
  set(userQuestionAtom, null);
  set(userQuestionSelectedIndexAtom, 0);
});

export const moveUserQuestionSelectionAtom = atom(null, (get, set, delta: number) => {
  const question = get(userQuestionAtom);
  if (question === null || question.choices.length === 0) {
    return;
  }
  set(
    userQuestionSelectedIndexAtom,
    clamp(get(userQuestionSelectedIndexAtom) + delta, 0, question.choices.length - 1)
  );
});
