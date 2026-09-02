import { atom } from 'jotai';
import { activeModelLabelAtom } from '@state/global/activeModel.ts';
import { turnInFlightAtom } from '@state/promptQueue/store.ts';
import { highlightedCommandAtom } from '@state/ui/commands/atoms.ts';
import { highlightedEntryAtom } from '@state/ui/commands/atoms.ts';
import { entryFullName } from '@libs/commands/subcommands.ts';
import { gitStatusLabelAtom } from '@state/ui/gitStatus.ts';
import { armedActionAtom } from '@state/ui/keyArm.ts';
import { loadingFrameAtom, transientStatusHintAtom } from '@state/ui/statusHint.ts';

/**
 * Signature of the self-updating chrome rendered *around* the prompt composer on
 * the home surface — the cwd row's git label, the status bar's model label,
 * transient hint, armed-action hint, and loading/working spinner, plus the slash
 * menu's highlighted item. The composer subscribes to this so it re-renders, and
 * re-asserts the terminal caret, whenever any of that chrome repaints.
 *
 * Why this is needed: this Ink build only keeps the hardware cursor shown on a
 * frame where the cursor owner (the composer) called `setCursorPosition` — its
 * `cursorDirty` flag resets every render. So any sibling repaint that changes
 * output without re-rendering the composer silently drops the caret off the
 * prompt (the caret vanished when the loading spinner ticked, then again when the
 * git status arrived after backend load). `layoutAtom` — which the composer
 * already reads — re-renders it on body/dimension/row-count changes; this covers
 * the *same-size* text changes in the surrounding chrome that move no row. The
 * string return lets Jotai skip the re-render when nothing actually changed.
 *
 * Extend this whenever new self-updating text is rendered on the home surface
 * outside the composer, or the caret will drop when that text changes.
 */
export const composerChromeSignatureAtom = atom((get) => {
  const gitLabel = get(gitStatusLabelAtom) ?? '';
  const modelLabel = get(activeModelLabelAtom);
  const transient = get(transientStatusHintAtom)?.text ?? '';
  const armed = get(armedActionAtom) ?? '';
  const working = get(turnInFlightAtom) ? '1' : '0';
  const loadingFrame = get(loadingFrameAtom);
  const highlightedEntry = get(highlightedEntryAtom);
  const highlighted = highlightedEntry === undefined ? get(highlightedCommandAtom)?.name ?? '' : entryFullName(highlightedEntry);
  return [gitLabel, modelLabel, transient, armed, working, loadingFrame, highlighted].join('\u0000');
});
