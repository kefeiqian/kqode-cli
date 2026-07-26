import { atom } from 'jotai';
import type { SelectionPoint } from '@libs/selection/bounds.ts';
import { resolveBodyRowWindow } from '@libs/tui/bodyWindow.ts';
import { displayedBodyEntriesAtom } from '@state/ui/body.ts';
import { bodyScrollOffsetRowsAtom } from '@state/ui/bodyScroll.ts';
import { columnsAtom } from '@state/ui/dimensions.ts';
import { layoutAtom } from '@state/ui/layout.ts';

/** The active transcript selection represented by drag anchor and focus. */
export type BodySelection = { anchor: SelectionPoint; focus: SelectionPoint };

export const bodySelectionAtom = atom<BodySelection | null>(null);

export const startBodySelectionAtom = atom(null, (_get, set, point: SelectionPoint) => {
  set(bodySelectionAtom, { anchor: point, focus: point });
});

export const updateBodySelectionAtom = atom(null, (get, set, point: SelectionPoint) => {
  const current = get(bodySelectionAtom);
  set(bodySelectionAtom, { anchor: current?.anchor ?? point, focus: point });
});

export const clearBodySelectionAtom = atom(null, (_get, set) => {
  set(bodySelectionAtom, null);
});

/** Body-row geometry shared by rendering, mouse selection, and clipboard copy. */
export const visibleBodyRowsAtom = atom((get) =>
  resolveBodyRowWindow(
    get(displayedBodyEntriesAtom),
    get(columnsAtom),
    get(layoutAtom).bodyRows,
    get(bodyScrollOffsetRowsAtom)
  )
);
