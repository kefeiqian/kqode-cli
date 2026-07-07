import { Box, Text } from 'ink';
import { LOWER_HALF_BLOCK, UPPER_HALF_BLOCK } from '@libs/tui/backgroundBlock.ts';
import { PROMPT_PREFIX } from '@constants/ui.ts';
import { formatValidationError } from '@components/PromptComposer/promptTextView.ts';
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
        <Text
          backgroundColor={backgroundColor(shouldRenderBackground)}
          color={theme.colors.errorRed}
        >
          {formatValidationError(validationError, columns, shouldRenderBackground)}
        </Text>
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
  const rowColumns = Math.max(0, columns - prefix.length);

  return (
    // Pin the row to the safe content width. Without an explicit width Ink's
    // default `alignItems: stretch` grows this background box to the raw parent
    // width, painting `inputBackground` one column past the safe-width half-lines
    // into the reserved final column. That stray cell shows as a block past the
    // composer's right edge on the initial paint until the first keystroke's
    // incremental `ESC[K` erases it. Pinning the width keeps every composer row
    // at the safe width so the reserved column stays a background gutter.
    <Box backgroundColor={backgroundColor(shouldRenderBackground)} width={columns}>
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
        {shouldRenderBackground ? row.padEnd(rowColumns, ' ') : row}
      </Text>
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
