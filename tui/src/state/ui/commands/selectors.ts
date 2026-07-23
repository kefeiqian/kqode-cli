import { atom } from 'jotai';
import { MAX_COMMAND_MENU_ROWS } from '@constants/ui.ts';
import { filterCommands } from '@libs/commands/filterCommands.ts';
import { clamp } from '@libs/math/clamp.ts';
import type { CommandDefinition } from '@libs/commands/registry.ts';
import { composerStateAtom } from '@state/ui/composer/index.ts';
import {
  commandMenuDismissedAtom,
  commandMenuHighlightIndexAtom
} from '@state/ui/commands/state.ts';
import { inputLockedAtom } from '@state/ui/inputLock.ts';

const isCommandQueryAtom = atom((get) => get(composerStateAtom).text.startsWith('/'));

export const commandMenuMatchesAtom = atom<CommandDefinition[]>((get) =>
  get(isCommandQueryAtom) ? filterCommands(get(composerStateAtom).text) : []
);

export const commandMenuOpenAtom = atom(
  (get) => get(isCommandQueryAtom) && !get(inputLockedAtom) && !get(commandMenuDismissedAtom)
);

export const highlightedCommandAtom = atom<CommandDefinition | undefined>((get) => {
  const matches = get(commandMenuMatchesAtom);
  if (matches.length === 0) return undefined;
  return matches[clamp(get(commandMenuHighlightIndexAtom), 0, matches.length - 1)];
});

export const commandMenuDesiredRowsAtom = atom((get) => {
  if (!get(commandMenuOpenAtom)) return 0;
  const matches = get(commandMenuMatchesAtom);
  return matches.length === 0 ? 1 : Math.min(matches.length, MAX_COMMAND_MENU_ROWS);
});
