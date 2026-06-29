import { Box, useBoxMetrics, useCursor } from 'ink';
import { useAtomValue } from 'jotai';
import type { DOMElement } from 'ink';
import { useEffect, useRef } from 'react';
import { ComposerFrame } from '@components/PromptComposer/ComposerFrame.js';
import { PROMPT_PREFIX } from '@components/PromptComposer/constants.js';
import { resolveComposerCursorPosition } from '@components/PromptComposer/cursorPosition.js';
import {
  countVisibleComposerRows,
  formatVisiblePrompt,
  formatVisiblePromptView
} from '@components/PromptComposer/promptTextView.js';
import { usePromptComposerInput } from '@components/PromptComposer/usePromptComposerInput.js';
import { DEFAULT_COMPOSER_VISIBLE_LINES } from '@libs/tui/layout.js';
import {
  composerStateAtom,
  PROMPT_MAX_BYTES
} from '@state/composerAtoms.js';

type PromptComposerProps = {
  columns: number;
  onSubmit: (prompt: string) => void;
  isActive?: boolean;
  maxBytes?: number;
  maxVisibleLines?: number;
  cursorTop?: number;
  onVisibleRowsChange?: (rows: number) => void;
};

export { formatVisiblePrompt, resolveComposerCursorPosition };

export function PromptComposer({
  columns,
  onSubmit,
  isActive = true,
  maxBytes = PROMPT_MAX_BYTES,
  maxVisibleLines = DEFAULT_COMPOSER_VISIBLE_LINES,
  cursorTop,
  onVisibleRowsChange
}: PromptComposerProps) {
  const state = useAtomValue(composerStateAtom);
  const composerRef = useRef<DOMElement | null>(null);
  const composerMetrics = useBoxMetrics(composerRef);
  const { setCursorPosition } = useCursor();

  usePromptComposerInput({ isActive, maxBytes, onSubmit, state });

  const inputColumns = Math.max(1, columns - PROMPT_PREFIX.length);
  const visiblePrompt = formatVisiblePromptView(
    state.text,
    inputColumns,
    maxVisibleLines,
    state.cursorIndex
  );
  const visibleText = visiblePrompt.text;
  const shouldRenderBackground = true;
  const visibleRows = countVisibleComposerRows(
    visibleText,
    state.validationError !== null,
    shouldRenderBackground
  );

  useEffect(() => {
    onVisibleRowsChange?.(visibleRows);
  }, [onVisibleRowsChange, visibleRows]);

  if (isActive && composerMetrics.hasMeasured) {
    setCursorPosition(
      resolveComposerCursorPosition(
        visibleText,
        inputColumns,
        cursorTop ?? composerMetrics.top,
        visiblePrompt.cursorIndex,
        shouldRenderBackground
      )
    );
  } else {
    setCursorPosition(undefined);
  }

  return (
    <Box ref={composerRef} flexDirection="column">
      <ComposerFrame
        columns={columns}
        shouldRenderBackground={shouldRenderBackground}
        validationError={state.validationError}
        visibleTextRows={visibleText.split('\n')}
      />
    </Box>
  );
}
