import { atom } from 'jotai';
import { DOCKED_PANEL_ROWS } from '@constants/ui.ts';
import { resolveDockedPanelRows } from '@libs/tui/layout.ts';
import { rowsAtom } from '@state/ui/dimensions.ts';
import { resumePanelOpenAtom } from '@state/ui/resume/index.ts';
import { activeSurfaceAtom, Surface } from '@state/ui/surface/atoms.ts';

/**
 * The mutually exclusive bottom-docked command popups. The resume panel is
 * driven by its own open atom; the four slash surfaces are driven by
 * `activeSurfaceAtom` (wired in as each surface is docked). This coordinator
 * module imports both `surface` and `resume` so those two modules never import
 * each other — which would form a `@state`-internal import cycle the repo's
 * cycle detector rejects.
 */
export const DockedPanel = {
  Resume: 'resume',
  Theme: 'theme',
  Model: 'model',
  Connect: 'connect',
  Memory: 'memory'
} as const;

export type DockedPanel = (typeof DockedPanel)[keyof typeof DockedPanel];

/**
 * The single docked popup currently open, or `null` when the transcript and
 * composer are showing. Wires the resume panel only for now; the theme, model,
 * connect, and memory branches are added as each surface is docked. Layout
 * budgeting, bottom-stack rendering, composer/status suppression, and the home
 * screen's wheel/click guards all key off this one predicate.
 */
export const activeDockedPanelAtom = atom<DockedPanel | null>((get) => {
  if (get(resumePanelOpenAtom)) {
    return DockedPanel.Resume;
  }
  switch (get(activeSurfaceAtom)) {
    case Surface.Theme:
      return DockedPanel.Theme;
    case Surface.Model:
      return DockedPanel.Model;
    case Surface.Memory:
      return DockedPanel.Memory;
    case Surface.Connect:
      return DockedPanel.Connect;
    default:
      return null;
  }
});

/**
 * The constant desired height of the active docked popup: `DOCKED_PANEL_ROWS`
 * for every docked surface so switching between them never changes the popup
 * height, or `0` when nothing is docked. `resolveDockedPanelRows` then caps it to
 * at most half the terminal.
 */
export const dockedPanelDesiredRowsAtom = atom((get) =>
  get(activeDockedPanelAtom) === null ? 0 : DOCKED_PANEL_ROWS
);

/**
 * The rows actually reserved for the active docked popup: its desired height
 * capped to at most half the terminal (see `resolveDockedPanelRows`). The single
 * height source read by `layoutAtom`, `bottomSpacerRowsAtom`, and each docked
 * surface component so the two row-budget subtractions and the render all agree.
 */
export const dockedPanelRowsAtom = atom((get) =>
  resolveDockedPanelRows({ rows: get(rowsAtom), desiredRows: get(dockedPanelDesiredRowsAtom) })
);
