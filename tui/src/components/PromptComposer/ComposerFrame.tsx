import { Box, Text } from 'ink';
import { LOWER_HALF_BLOCK, UPPER_HALF_BLOCK } from '@libs/tui/backgroundBlock.js';
import { PROMPT_PREFIX } from '@components/PromptComposer/constants.js';
import { formatValidationError } from '@components/PromptComposer/promptTextView.js';
import { geminiDarkTheme } from '@theme/themeConfig.js';

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
          color={geminiDarkTheme.colors.errorRed}
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
    <Box backgroundColor={backgroundColor(shouldRenderBackground)}>
      <Text
        backgroundColor={backgroundColor(shouldRenderBackground)}
        color={rowIndex === 0 ? geminiDarkTheme.colors.accentBlue : geminiDarkTheme.colors.foreground}
      >
        {prefix}
      </Text>
      <Text
        backgroundColor={backgroundColor(shouldRenderBackground)}
        color={geminiDarkTheme.colors.foreground}
      >
        {shouldRenderBackground ? row.padEnd(rowColumns, ' ') : row}
      </Text>
    </Box>
  );
}

function ComposerHalfLine({ glyph, columns }: { glyph: string; columns: number }) {
  return (
    <Text
      backgroundColor={geminiDarkTheme.colors.bodyBackground}
      color={geminiDarkTheme.colors.inputBackground}
    >
      {glyph.repeat(Math.max(1, columns))}
    </Text>
  );
}

function promptPrefixForRow(index: number): string {
  return index === 0 ? PROMPT_PREFIX : ' '.repeat(PROMPT_PREFIX.length);
}

function backgroundColor(isEnabled: boolean): string | undefined {
  return isEnabled ? geminiDarkTheme.colors.inputBackground : undefined;
}
