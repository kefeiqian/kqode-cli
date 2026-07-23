import { atom } from 'jotai';
import { PROMPT_PREFIX } from '@constants/ui.ts';
import { clamp } from '@libs/math/clamp.ts';
import {
  resolveComposerWindow,
  resolveScrollIntoViewOffset
} from '@libs/composer/composerWindow.ts';
import {
  composerScrollOffsetRowsAtom,
  composerStateAtom
} from '@state/ui/composer/index.ts';
import { columnsAtom } from '@state/ui/dimensions.ts';
import { layoutAtom } from '@state/ui/layout.ts';

/** Visible composer window shared by wheel routing and scroll actions. */
const composerWindowAtom = atom((get) => {
  const inputColumns = Math.max(1, get(columnsAtom) - PROMPT_PREFIX.length);
  const { text, cursorIndex } = get(composerStateAtom);
  return resolveComposerWindow({
    text,
    columns: inputColumns,
    maxVisibleLines: get(layoutAtom).composerVisibleRows,
    cursorIndex,
    offset: get(composerScrollOffsetRowsAtom)
  });
});

export const composerCanScrollAtom = atom((get) => get(composerWindowAtom).canScroll);

export const scrollComposerByRowsAtom = atom(null, (get, set, deltaRows: number) => {
  const { minOffset, maxOffset } = get(composerWindowAtom);
  set(composerScrollOffsetRowsAtom, (current) =>
    clamp(current + deltaRows, minOffset, maxOffset)
  );
});

/** Minimally scrolls the composer when an edit or cursor move hides the caret. */
export const scrollComposerCursorIntoViewAtom = atom(null, (get, set) => {
  const inputColumns = Math.max(1, get(columnsAtom) - PROMPT_PREFIX.length);
  const { text, cursorIndex } = get(composerStateAtom);
  set(
    composerScrollOffsetRowsAtom,
    resolveScrollIntoViewOffset({
      text,
      columns: inputColumns,
      maxVisibleLines: get(layoutAtom).composerVisibleRows,
      cursorIndex,
      offset: get(composerScrollOffsetRowsAtom)
    })
  );
});
