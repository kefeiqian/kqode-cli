import { usePaste } from 'ink';
import { useStore } from 'jotai';
import { sanitizePastedText } from '@libs/composer/pastedText.ts';
import { insertComposerTextAtom } from '@state/ui/composer/index.ts';

type UsePasteInputOptions = {
  maxBytes: number;
};

/**
 * Keeps bracketed paste active for the mounted home-screen composer.
 *
 * The hook intentionally does not follow the composer's input lock: paste input
 * should stay bracketed during streaming or later copy-mode flows and arrive as
 * one app-level insertion rather than individual keystrokes.
 */
export function usePasteInput({ maxBytes }: UsePasteInputOptions): void {
  const store = useStore();

  usePaste((text) => {
    store.set(insertComposerTextAtom, { maxBytes, text: sanitizePastedText(text) });
  });
}
