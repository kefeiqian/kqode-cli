import { atom } from 'jotai';
import { clamp } from '@libs/math/clamp.ts';
import { countBodyRows } from '@libs/tui/bodyRows.ts';
import { displayedBodyEntriesAtom } from '@state/ui/body.ts';
import { columnsAtom } from '@state/ui/dimensions.ts';
import { layoutAtom } from '@state/ui/layout.ts';

export const bodyScrollOffsetRowsAtom = atom(0);

export const maxBodyScrollOffsetRowsAtom = atom((get) => {
  const columns = get(columnsAtom);
  const layout = get(layoutAtom);
  const bodyRowsForScroll = countBodyRows(
    get(displayedBodyEntriesAtom),
    columns,
    layout.bodyRows
  );
  return Math.max(0, bodyRowsForScroll - layout.bodyRows);
});

export const scrollBodyByRowsAtom = atom(null, (get, set, deltaRows: number) => {
  const maxOffset = get(maxBodyScrollOffsetRowsAtom);
  set(bodyScrollOffsetRowsAtom, (current) =>
    clamp(current + deltaRows, 0, maxOffset)
  );
});
