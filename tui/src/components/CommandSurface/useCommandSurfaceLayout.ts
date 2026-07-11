import { useAtomValue } from 'jotai';
import { resolveDockedFooterGap } from '@libs/tui/layout.ts';
import { safeChromeColumnsAtom } from '@state/ui/index.ts';

/** Resolved chrome math for one docked command surface. */
export interface CommandSurfaceLayout {
  /** Rows available for the surface body (`panelRows − resolved chrome`), floored at 1. */
  bodyRows: number;
  /** Whether the blank gap row above the footer renders (yielded only at the `/memory` hard cap). */
  showFooterGap: boolean;
  /** The shared safe content width the frame renders at. */
  columns: number;
}

/**
 * Centralizes the docked-popup chrome math for a command surface: wraps
 * `resolveDockedFooterGap` and derives the body-row budget from the panel height,
 * returning everything a surface needs for its `setVisibleRows` effect and its
 * render-time list windowing.
 *
 * `panelRows` is the surface's resolved docked height — surfaces pass their own
 * atom value (`dockedPanelRowsAtom`, or `resumePanelRowsAtom` for resume) so the
 * hook stays agnostic of which dock atom applies. `chromeWithGap` is the surface's
 * declared chrome-row budget (`divider + label + header + gap + footer`), and
 * `reservedContentRows` is any non-selectable in-body row (e.g. `/memory`'s table
 * header) that the gap yields for at the hard `⌊rows/2⌋` cap.
 */
export function useCommandSurfaceLayout({
  panelRows,
  chromeWithGap,
  reservedContentRows = 0
}: {
  panelRows: number;
  chromeWithGap: number;
  reservedContentRows?: number;
}): CommandSurfaceLayout {
  const columns = useAtomValue(safeChromeColumnsAtom);
  const { showFooterGap, chromeRows } = resolveDockedFooterGap({
    panelRows,
    chromeWithGap,
    reservedContentRows
  });

  return { bodyRows: Math.max(1, panelRows - chromeRows), showFooterGap, columns };
}
