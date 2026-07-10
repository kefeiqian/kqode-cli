import { atom } from 'jotai';
import { resumePanelOpenAtom } from '@state/ui/resume/index.ts';

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
export const activeDockedPanelAtom = atom<DockedPanel | null>((get) =>
  get(resumePanelOpenAtom) ? DockedPanel.Resume : null
);
