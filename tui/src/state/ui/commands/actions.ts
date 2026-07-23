import { atom } from 'jotai';
import { clamp } from '@libs/math/clamp.ts';
import { commandMenuMatchesAtom } from '@state/ui/commands/selectors.ts';
import { commandMenuHighlightIndexAtom } from '@state/ui/commands/state.ts';

export const moveCommandHighlightAtom = atom(null, (get, set, delta: number) => {
  const matches = get(commandMenuMatchesAtom);
  if (matches.length === 0) return;

  const current = clamp(get(commandMenuHighlightIndexAtom), 0, matches.length - 1);
  const next = clamp(current + delta, 0, matches.length - 1);
  if (next !== current) {
    set(commandMenuHighlightIndexAtom, next);
  }
});

export const resetCommandHighlightAtom = atom(null, (get, set) => {
  if (get(commandMenuHighlightIndexAtom) !== 0) {
    set(commandMenuHighlightIndexAtom, 0);
  }
});
