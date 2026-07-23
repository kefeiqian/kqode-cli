import { Box, Text } from 'ink';
import { LOWER_HALF_BLOCK, UPPER_HALF_BLOCK } from '@libs/tui/backgroundBlock.ts';
import {
  COMPOSER_RIGHT_PADDING_COLUMNS,
  PROMPT_PREFIX
} from '@constants/ui.ts';
import { resolveComposerInputColumns } from '@libs/composer/layout.ts';
import { formatValidationError } from '@libs/composer/promptTextView.ts';
import { padEndToWidth } from '@libs/text/displayWidth.ts';
import { theme } from '@theme/themeConfig.ts';

type ComposerFrameProps = {
  columns: number;
  shouldRenderBackground: boolean;
  validationError: string | null;
  visibleTextRows: string[];
};

export function ComposerFrame({
  columns,
  shouldRenderBackground,
  validationError,
  visibleTextRows
}: ComposerFrameProps) {
  return (
    <>
      {shouldRenderBackground ? <ComposerHalfLine glyph={LOWER_HALF_BLOCK} columns={columns} /> : null}
      {visibleTextRows.map((row, index) => (
        <ComposerTextRow
          columns={columns}
          key={`${index}-${row}`}
          row={row}
          rowIndex={index}
          shouldRenderBackground={shouldRenderBackground}
        />
      ))}
      {validationError === null ? null : (
        <Box
          width={columns}
          backgroundColor={backgroundColor(shouldRenderBackground)}
        >
          <Text
            backgroundColor={backgroundColor(shouldRenderBackground)}
            color={theme.colors.errorRed}
          >
            {formatValidationError(
              validationError,
              columns - COMPOSER_RIGHT_PADDING_COLUMNS,
              shouldRenderBackground
            )}
          </Text>
          {shouldRenderBackground ? (
            <Text backgroundColor={backgroundColor(true)}>
              {' '.repeat(COMPOSER_RIGHT_PADDING_COLUMNS)}
            </Text>
          ) : null}
        </Box>
      )}
      {shouldRenderBackground ? <ComposerHalfLine glyph={UPPER_HALF_BLOCK} columns={columns} /> : null}
    </>
  );
}

function ComposerTextRow({
  columns,
  row,
  rowIndex,
  shouldRenderBackground
}: {
  columns: number;
  row: string;
  rowIndex: number;
  shouldRenderBackground: boolean;
}) {
  const prefix = promptPrefixForRow(rowIndex);
  const rowColumns = shouldRenderBackground
    ? resolveComposerInputColumns(columns)
    : Math.max(0, columns - prefix.length);

  return (
    // Prevent Yoga's default stretch from painting this row into the reserved
    // final-column gutter before the first incremental repaint.
    <Box
      width={columns}
      backgroundColor={backgroundColor(shouldRenderBackground)}
    >
      <Text
        backgroundColor={backgroundColor(shouldRenderBackground)}
        color={rowIndex === 0 ? theme.colors.accentBlue : theme.colors.foreground}
      >
        {prefix}
      </Text>
      <Text
        backgroundColor={backgroundColor(shouldRenderBackground)}
        color={theme.colors.foreground}
      >
        {shouldRenderBackground ? padEndToWidth(row, rowColumns) : row}
      </Text>
      {shouldRenderBackground ? (
        <Text backgroundColor={backgroundColor(true)}>
          {' '.repeat(COMPOSER_RIGHT_PADDING_COLUMNS)}
        </Text>
      ) : null}
    </Box>
  );
}

function ComposerHalfLine({ glyph, columns }: { glyph: string; columns: number }) {
  return (
    <Text
      backgroundColor={theme.colors.bodyBackground}
      color={theme.colors.inputBackground}
    >
      {glyph.repeat(Math.max(1, columns))}
    </Text>
  );
}

function promptPrefixForRow(index: number): string {
  return index === 0 ? PROMPT_PREFIX : ' '.repeat(PROMPT_PREFIX.length);
}

function backgroundColor(isEnabled: boolean): string | undefined {
  return isEnabled ? theme.colors.inputBackground : undefined;
}
