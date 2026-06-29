import { Box, Text, useBoxMetrics, useCursor, useInput, useIsScreenReaderEnabled, useStdout } from 'ink';
import type { DOMElement } from 'ink';
import { useEffect, useRef, useReducer } from 'react';
import { shouldRenderBackgroundBlock } from '@components/BackgroundBlock.js';
import type { BackgroundBlockMode } from '@components/BackgroundBlock.js';
import { DEFAULT_COMPOSER_VISIBLE_LINES } from '@components/layout.js';
import {
  composerReducer,
  initialComposerState,
  printableInput,
  PROMPT_MAX_BYTES,
  validateComposerSubmit
} from '@state/composerReducer.js';
import { clipTextRight } from '@libs/text/clipText.js';
import { isMouseInput } from '@libs/terminal/mouse.js';
import { githubDarkTheme } from '@theme/themeConfig.js';

type PromptComposerProps = {
  columns: number;
  onSubmit: (prompt: string) => void;
  isActive?: boolean;
  maxBytes?: number;
  maxVisibleLines?: number;
  cursorTop?: number;
  backgroundMode?: BackgroundBlockMode;
  onVisibleRowsChange?: (rows: number) => void;
};

const PROMPT_PREFIX = '> ';
const INK_CURSOR_ROW_ORIGIN_OFFSET = 1;

export function PromptComposer({
  columns,
  onSubmit,
  isActive = true,
  maxBytes = PROMPT_MAX_BYTES,
  maxVisibleLines = DEFAULT_COMPOSER_VISIBLE_LINES,
  cursorTop,
  backgroundMode = 'enabled',
  onVisibleRowsChange
}: PromptComposerProps) {
  const [state, dispatch] = useReducer(composerReducer, initialComposerState);
  const composerRef = useRef<DOMElement | null>(null);
  const composerMetrics = useBoxMetrics(composerRef);
  const isScreenReaderEnabled = useIsScreenReaderEnabled();
  const { stdout } = useStdout();
  const { setCursorPosition } = useCursor();

  useInput(
    (input, key) => {
      if (isMouseInput(input)) {
        return;
      }

      if (key.return && key.shift) {
        dispatch({ type: 'insert', text: '\n', maxBytes });
        return;
      }

      if (key.leftArrow) {
        dispatch({ type: 'moveCursorBackward' });
        return;
      }

      if (key.rightArrow) {
        dispatch({ type: 'moveCursorForward' });
        return;
      }

      if (key.return) {
        const validation = validateComposerSubmit(state.text, maxBytes);
        if (!validation.ok) {
          if (validation.reason === 'over-limit') {
            dispatch({ type: 'setValidationError', message: validation.message });
          }
          return;
        }

        onSubmit(validation.text);
        dispatch({ type: 'clear' });
        return;
      }

      if (key.backspace || key.delete) {
        dispatch({ type: 'deleteBackward', maxBytes });
        return;
      }

      if (key.tab) {
        return;
      }

      const printable = printableInput(input);
      if (printable.length > 0) {
        dispatch({ type: 'insert', text: printable, maxBytes });
      }
    },
    { isActive }
  );

  const inputColumns = Math.max(1, columns - PROMPT_PREFIX.length);
  const visiblePrompt = formatVisiblePromptView(
    state.text,
    inputColumns,
    maxVisibleLines,
    state.cursorIndex
  );
  const visibleText = visiblePrompt.text;
  const visibleTextRows = visibleText.split('\n');
  const shouldRenderBackground = shouldRenderBackgroundBlock({
    colorDepth: stdout.getColorDepth?.(),
    isNoColor: process.env.NO_COLOR !== undefined,
    isScreenReaderEnabled,
    mode: backgroundMode
  });
  const visibleRows = countVisibleComposerRows(visibleText, state.validationError !== null);
  useEffect(() => {
    onVisibleRowsChange?.(visibleRows);
  }, [onVisibleRowsChange, visibleRows]);

  if (isActive && composerMetrics.hasMeasured) {
    setCursorPosition(
      resolveComposerCursorPosition(
        visibleText,
        inputColumns,
        cursorTop ?? composerMetrics.top,
        visiblePrompt.cursorIndex
      )
    );
  } else {
    setCursorPosition(undefined);
  }

  return (
    <Box ref={composerRef} flexDirection="column">
      {visibleTextRows.map((row, index) => {
        const prefix = index === 0 ? PROMPT_PREFIX : '';
        const rowColumns = Math.max(0, columns - prefix.length);

        return (
          <Box key={`${index}-${row}`} backgroundColor={backgroundColor(shouldRenderBackground)}>
            {prefix.length > 0 ? (
              <Text
                backgroundColor={backgroundColor(shouldRenderBackground)}
                color={githubDarkTheme.colors.accentBlue}
              >
                {prefix}
              </Text>
            ) : null}
            <Text
              backgroundColor={backgroundColor(shouldRenderBackground)}
              color={githubDarkTheme.colors.foreground}
            >
              {shouldRenderBackground ? row.padEnd(rowColumns, ' ') : row}
            </Text>
          </Box>
        );
      })}
      {state.validationError === null ? null : (
        <Text
          backgroundColor={backgroundColor(shouldRenderBackground)}
          color={githubDarkTheme.colors.errorRed}
        >
          {formatValidationError(state.validationError, columns, shouldRenderBackground)}
        </Text>
      )}
    </Box>
  );
}

function backgroundColor(isEnabled: boolean): string | undefined {
  return isEnabled ? githubDarkTheme.colors.inputBackground : undefined;
}

function formatValidationError(error: string, columns: number, shouldPad: boolean): string {
  const errorLine = fitComposerLine(`ERROR: ${error}`, columns);
  return shouldPad ? errorLine.padEnd(columns, ' ') : errorLine;
}

export function formatVisiblePrompt(text: string, columns: number, maxVisibleLines: number): string {
  return formatVisiblePromptView(text, columns, maxVisibleLines, text.length).text;
}

type WrappedPromptRow = {
  text: string;
  start: number;
  end: number;
};

function formatVisiblePromptView(
  text: string,
  columns: number,
  maxVisibleLines: number,
  cursorIndex: number
): { text: string; cursorIndex: number } {
  const safeColumns = Math.max(1, columns);
  const safeMaxVisibleLines = Math.max(1, maxVisibleLines);
  const rows = wrapText(text, safeColumns);
  const safeCursorIndex = Math.max(0, Math.min(cursorIndex, text.length));
  const cursorRowIndex = resolveCursorRowIndex(rows, safeCursorIndex);
  const lastVisibleStart = Math.max(0, rows.length - safeMaxVisibleLines);
  const visibleStart = Math.min(Math.max(0, cursorRowIndex - safeMaxVisibleLines + 1), lastVisibleStart);
  const visibleRows = rows.slice(visibleStart, visibleStart + safeMaxVisibleLines);
  const visibleCursorIndex = resolveVisibleCursorIndex(visibleRows, safeCursorIndex);

  return {
    text: visibleRows.map((row) => row.text).join('\n'),
    cursorIndex: visibleCursorIndex
  };
}

function wrapText(text: string, columns: number): WrappedPromptRow[] {
  if (text.length === 0) {
    return [{ text: '', start: 0, end: 0 }];
  }

  const rows: WrappedPromptRow[] = [];
  let lineStart = 0;

  while (lineStart <= text.length) {
    const newlineIndex = text.indexOf('\n', lineStart);
    const lineEnd = newlineIndex < 0 ? text.length : newlineIndex;
    const rawLine = text.slice(lineStart, lineEnd);
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;

    if (line.length === 0) {
      rows.push({ text: '', start: lineStart, end: lineStart });
    } else {
      for (let offset = 0; offset < line.length; offset += columns) {
        const endOffset = Math.min(offset + columns, line.length);
        rows.push({
          text: line.slice(offset, endOffset),
          start: lineStart + offset,
          end: lineStart + endOffset
        });
      }
    }

    if (newlineIndex < 0) {
      break;
    }

    lineStart = newlineIndex + 1;
  }

  return rows;
}

function resolveCursorRowIndex(rows: WrappedPromptRow[], cursorIndex: number): number {
  return Math.max(
    0,
    rows.findIndex((row) => cursorIndex >= row.start && cursorIndex <= row.end)
  );
}

function resolveVisibleCursorIndex(rows: WrappedPromptRow[], cursorIndex: number): number {
  let visibleCursorIndex = 0;

  for (const row of rows) {
    if (cursorIndex >= row.start && cursorIndex <= row.end) {
      return visibleCursorIndex + Math.min(row.text.length, cursorIndex - row.start);
    }

    visibleCursorIndex += row.text.length + 1;
  }

  return Math.max(0, visibleCursorIndex - 1);
}

function fitComposerLine(text: string, columns: number): string {
  return clipTextRight(text, columns);
}

function countVisibleComposerRows(visibleText: string, hasValidationError: boolean): number {
  return visibleText.split('\n').length + (hasValidationError ? 1 : 0);
}

export function resolveComposerCursorPosition(
  visibleText: string,
  columns: number,
  composerTop: number,
  cursorIndex = visibleText.length
): { x: number; y: number } {
  const cursorPosition = cursorPositionForVisibleText(visibleText, columns, cursorIndex);

  return {
    x: PROMPT_PREFIX.length + cursorPosition.x,
    y: composerTop + cursorPosition.y + INK_CURSOR_ROW_ORIGIN_OFFSET
  };
}

function cursorPositionForVisibleText(
  text: string,
  columns: number,
  cursorIndex: number
): { x: number; y: number } {
  const textBeforeCursor = text.slice(0, Math.max(0, Math.min(cursorIndex, text.length)));
  const lines = textBeforeCursor.split('\n');
  const lastLine = lines.at(-1) ?? '';
  return {
    x: Math.min(lastLine.length, columns),
    y: lines.length - 1
  };
}
