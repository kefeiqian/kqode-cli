import { atom } from 'jotai';
import { COMMAND_MENU_PANEL_ROWS } from '@constants/ui.ts';
import { clamp } from '@libs/math/clamp.ts';
import { filterCommands } from '@libs/commands/filterCommands.ts';
import { composerStateAtom } from '@state/ui/composer/index.ts';
import { inputLockedAtom } from '@state/ui/inputLock.ts';
import type { CommandDefinition } from '@libs/commands/registry.ts';

/** True while the composer text begins a slash command (`/...`). */
const isCommandQueryAtom = atom((get) => get(composerStateAtom).text.startsWith('/'));

/** Commands matching the current composer text; empty when it is not a command query. */
export const commandMenuMatchesAtom = atom<CommandDefinition[]>((get) =>
  get(isCommandQueryAtom) ? filterCommands(get(composerStateAtom).text) : []
);

/** Set by Esc to hide the menu without clearing the text; cleared on the next edit. */
export const commandMenuDismissedAtom = atom(false);

/**
 * The menu is open whenever the composer holds a slash query, input is unlocked,
 * and it has not been Esc-dismissed. It is intentionally NOT gated on having
 * matches — at zero matches the view shows a "No matching commands" row so the
 * keyboard mode never switches invisibly.
 */
export const commandMenuOpenAtom = atom(
  (get) => get(isCommandQueryAtom) && !get(inputLockedAtom) && !get(commandMenuDismissedAtom)
);

/** Raw highlight index; derived reads clamp it against the current matches. */
export const commandMenuHighlightIndexAtom = atom(0);

/** The highlighted command, or undefined when there are no matches. */
export const highlightedCommandAtom = atom<CommandDefinition | undefined>((get) => {
  const matches = get(commandMenuMatchesAtom);
  if (matches.length === 0) {
    return undefined;
  }
  const index = clamp(get(commandMenuHighlightIndexAtom), 0, matches.length - 1);
  return matches[index];
});

/**
 * Rows the menu wants to render: the fixed panel height while open (matching
 * commands fill from the top, remaining rows stay blank, and the "No matching
 * commands" state occupies the top row), or zero when closed. U4 clamps this to
 * the space actually free above the composer.
 */
export const commandMenuDesiredRowsAtom = atom((get) => {
  if (!get(commandMenuOpenAtom)) {
    return 0;
  }

  return COMMAND_MENU_PANEL_ROWS;
});

/** Moves the highlight by `delta`, clamped to the current match range. */
export const moveCommandHighlightAtom = atom(null, (get, set, delta: number) => {
  const matches = get(commandMenuMatchesAtom);
  if (matches.length === 0) {
    return;
  }

  const current = clamp(get(commandMenuHighlightIndexAtom), 0, matches.length - 1);
  const next = clamp(current + delta, 0, matches.length - 1);
  if (next !== current) {
    set(commandMenuHighlightIndexAtom, next);
  }
});

/** Resets the highlight to the top; called when the match set changes. */
export const resetCommandHighlightAtom = atom(null, (get, set) => {
  if (get(commandMenuHighlightIndexAtom) !== 0) {
    set(commandMenuHighlightIndexAtom, 0);
  }
});
