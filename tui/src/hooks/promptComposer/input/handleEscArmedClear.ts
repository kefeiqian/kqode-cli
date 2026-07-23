import { ArmedAction } from '@constants/ui.ts';
import type { ComposerKeyHandler } from '@hooks/promptComposer/input/types.ts';
import { clearComposerAtom } from '@state/ui/composer/index.ts';
import { armedActionAtom } from '@state/ui/index.ts';

/**
 * Esc while the command menu is closed (the menu owns Esc when open, so this runs
 * after it). First press with non-empty text arms `'clear-input'`; a second Esc
 * clears the composer and disarms. Empty composer is a no-op but still consumes
 * the key, matching the original single dispatcher.
 */
export const handleEscArmedClear: ComposerKeyHandler = (context) => {
  if (context.key.escape !== true) {
    return false;
  }

  const { state, store } = context;
  if (store.get(armedActionAtom) === ArmedAction.ClearInput) {
    store.set(clearComposerAtom);
    store.set(armedActionAtom, null);
  } else if (state.text.length > 0) {
    store.set(armedActionAtom, ArmedAction.ClearInput);
  }
  return true;
};
