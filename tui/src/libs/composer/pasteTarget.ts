export type ComposerPasteTarget = {
  cursorIndex: number;
  text: string;
};

export function sameComposerPasteTarget(
  left: ComposerPasteTarget,
  right: ComposerPasteTarget
): boolean {
  return left.cursorIndex === right.cursorIndex && left.text === right.text;
}
