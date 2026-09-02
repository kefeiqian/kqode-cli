import type { ComposerKeyHandler } from '@components/PromptComposer/input/types.ts';
import { backendClientAtom } from '@state/global/index.ts';
import { activeTurnIdAtom } from '@state/promptQueue/index.ts';
import { commandMenuOpenAtom } from '@state/ui/commands/index.ts';

/**
 * Cancels the active backend turn on Esc after slash-menu dismissal has had the
 * first chance to consume the key, but before Esc can arm/clear composer text.
 */
export const handleEscCancelTurn: ComposerKeyHandler = ({ key, store }) => {
  if (key.escape !== true || store.get(commandMenuOpenAtom)) {
    return false;
  }

  const activeTurnId = store.get(activeTurnIdAtom);
  if (activeTurnId === null) {
    return false;
  }

  void store
    .get(backendClientAtom)
    ?.cancelTurn(activeTurnId)
    .catch(() => undefined);
  return true;
};
