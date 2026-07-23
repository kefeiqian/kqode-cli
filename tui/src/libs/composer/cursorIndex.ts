import { clamp } from '@libs/math/clamp.ts';
import { clampToGraphemeBoundary } from '@libs/text/displayWidth.ts';

export function clampComposerCursorIndex(text: string, cursorIndex: number): number {
  return clampToGraphemeBoundary(text, clamp(cursorIndex, 0, text.length));
}
