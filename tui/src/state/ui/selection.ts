import { atom } from 'jotai';
import type { SelectionPoint } from '@libs/selection/bounds.ts';

/** An in-app transcript selection as an anchor (drag start) and focus (drag end). */
export type BodySelection = { anchor: SelectionPoint; focus: SelectionPoint };

/** The active transcript selection, or `null` when nothing is selected. */
export const bodySelectionAtom = atom<BodySelection | null>(null);

/** Begins a selection at `point`; anchor and focus coincide until the drag moves. */
export const startBodySelectionAtom = atom(null, (_get, set, point: SelectionPoint) => {
  set(bodySelectionAtom, { anchor: point, focus: point });
});

/** Extends the active selection's focus to `point`, or begins one if none exists. */
export const updateBodySelectionAtom = atom(null, (get, set, point: SelectionPoint) => {
  const current = get(bodySelectionAtom);
  set(bodySelectionAtom, { anchor: current?.anchor ?? point, focus: point });
});

/**
 * Replaces the selection with an explicit anchor/focus span. Used for word and
 * line selection (double/triple-click), where both endpoints are computed up
 * front rather than dragged out.
 */
export const setBodySelectionRangeAtom = atom(null, (_get, set, selection: BodySelection) => {
  set(bodySelectionAtom, selection);
});

/** Clears the active selection. */
export const clearBodySelectionAtom = atom(null, (_get, set) => {
  set(bodySelectionAtom, null);
});
