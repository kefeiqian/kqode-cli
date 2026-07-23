import { COMPOSER_BACKGROUND_PADDING_ROWS } from '@constants/ui.ts';
import { padEndToWidth, truncateToWidth } from '@libs/text/displayWidth.ts';

export function countVisibleComposerRows(
  visibleRowCount: number,
  hasValidationError: boolean,
  hasBackgroundPadding: boolean
): number {
  return (
    visibleRowCount +
    (hasValidationError ? 1 : 0) +
    (hasBackgroundPadding ? COMPOSER_BACKGROUND_PADDING_ROWS : 0)
  );
}

export function formatValidationError(error: string, columns: number, shouldPad: boolean): string {
  const errorLine = truncateToWidth(`ERROR: ${error}`, columns);
  return shouldPad ? padEndToWidth(errorLine, columns) : errorLine;
}
