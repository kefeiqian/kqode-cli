import { useCursor } from 'ink';
import { useAtomValue } from 'jotai';
import { composerCaretRefreshTickAtom } from '@state/ui/composer/index.ts';

type ComposerCaretProps = {
  position: { x: number; y: number } | undefined;
};

export function ComposerCaret({ position }: ComposerCaretProps) {
  // Scroll repaints reset Ink's cursorDirty flag. Keep this subscription in a
  // leaf so re-asserting the caret does not re-render the full composer.
  useAtomValue(composerCaretRefreshTickAtom);
  const { setCursorPosition } = useCursor();

  setCursorPosition(position);
  return null;
}
