import { Box, Text } from 'ink';
import {
  resolveComposerBackgroundEnabled,
  resolveComposerBorderColumns,
  resolveSurfaceBorderGlyph,
  type SurfaceBorderEdge
} from '@libs/terminal/surfaceBorder.ts';
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
  terminalColumns: number;
  shouldRenderBackground: boolean;
  validationError: string | null;
  visibleTextRows: string[];
};

export function ComposerFrame({
  columns,
  terminalColumns,
  shouldRenderBackground,
  validationError,
  visibleTextRows
}: ComposerFrameProps) {
  const renderInputBackground =
    shouldRenderBackground && resolveComposerBackgroundEnabled();

  return (
    <>
      {shouldRenderBackground ? (
        <ComposerBorder
          edge="top"
          columns={resolveComposerBorderColumns(columns, terminalColumns)}
        />
      ) : null}
      {visibleTextRows.map((row, index) => (
        <ComposerTextRow
          columns={columns}
          key={`${index}-${row}`}
          row={row}
          rowIndex={index}
          shouldRenderBackground={renderInputBackground}
        />
      ))}
      {validationError === null ? null : (
        <Box
          width={columns}
          backgroundColor={backgroundColor(renderInputBackground)}
        >
          <Text
            backgroundColor={backgroundColor(renderInputBackground)}
            color={theme.colors.errorRed}
          >
            {formatValidationError(
              validationError,
              columns - COMPOSER_RIGHT_PADDING_COLUMNS,
              renderInputBackground
            )}
          </Text>
          {renderInputBackground ? (
            <Text backgroundColor={backgroundColor(true)}>
              {' '.repeat(COMPOSER_RIGHT_PADDING_COLUMNS)}
            </Text>
          ) : null}
        </Box>
      )}
      {shouldRenderBackground ? (
        <ComposerBorder
          edge="bottom"
          columns={resolveComposerBorderColumns(columns, terminalColumns)}
        />
      ) : null}
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
  const rowColumns = resolveComposerInputColumns(columns);

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
        {padEndToWidth(row, rowColumns)}
      </Text>
      <Text backgroundColor={backgroundColor(shouldRenderBackground)}>
        {' '.repeat(COMPOSER_RIGHT_PADDING_COLUMNS)}
      </Text>
    </Box>
  );
}

function ComposerBorder({ edge, columns }: { edge: SurfaceBorderEdge; columns: number }) {
  const glyph = resolveSurfaceBorderGlyph(edge);

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
