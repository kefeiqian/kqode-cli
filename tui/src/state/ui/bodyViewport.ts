import { atom } from 'jotai';
import { DEFAULT_BODY_ENTRIES } from '@libs/tui/bodyRows.ts';
import { resolveBodyRowWindow } from '@libs/tui/bodyWindow.ts';
import { activeThemeAtom } from '@state/global/theme.ts';
import {
  bodyScrollOffsetRowsAtom,
  displayedBodyEntriesAtom,
  homeHeaderRowsAtom,
  layoutAtom
} from '@state/ui/atoms.ts';
import { safeChromeColumnsAtom } from '@state/ui/dimensions.ts';

/**
 * Wrapped transcript rows plus the visible window, derived identically to
 * `BodyPane`'s render slice so mouse selection and the highlight overlay resolve
 * against the same rows and offsets.
 */
export const visibleBodyRowsAtom = atom((get) =>
  resolveBodyRowWindow(
    get(displayedBodyEntriesAtom) ?? DEFAULT_BODY_ENTRIES,
    get(safeChromeColumnsAtom),
    get(layoutAtom).bodyRows,
    get(bodyScrollOffsetRowsAtom),
    get(activeThemeAtom)
  )
);

/**
 * Zero-based screen row where the transcript body begins. Mirrors
 * `composerTopAtom`'s reconciliation of 1-based SGR mouse rows with Ink's
 * zero-based rows: `bodyRowIndex = sgrRow - 1 - bodyTop`.
 */
export const bodyTopAtom = atom((get) => get(homeHeaderRowsAtom));
