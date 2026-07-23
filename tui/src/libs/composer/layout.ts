import {
  COMPOSER_RIGHT_PADDING_COLUMNS,
  PROMPT_PREFIX
} from '@constants/ui.ts';

/** Display columns available to authored prompt text inside the composer row. */
export function resolveComposerInputColumns(composerColumns: number): number {
  return Math.max(
    1,
    composerColumns - PROMPT_PREFIX.length - COMPOSER_RIGHT_PADDING_COLUMNS
  );
}
