import { Box, useBoxMetrics, useCursor } from 'ink';
import { useAtomValue, useSetAtom } from 'jotai';
import type { DOMElement } from 'ink';
import { useEffect, useRef } from 'react';
import { ComposerFrame } from '@components/PromptComposer/ComposerFrame.tsx';
import { PROMPT_PREFIX } from '@constants/ui.ts';
import { resolveComposerCursorPosition } from '@components/PromptComposer/cursorPosition.ts';
import {
  countVisibleComposerRows,
  formatVisiblePrompt,
  formatVisiblePromptView
} from '@components/PromptComposer/promptTextView.ts';
import { usePromptComposerInput } from '@components/PromptComposer/usePromptComposerInput.ts';
import { DEFAULT_COMPOSER_VISIBLE_LINES } from '@constants/ui.ts';
import { enqueuePromptAtom } from '@state/backend/index.ts';
import {
  composerStateAtom,
  PROMPT_MAX_BYTES
} from '@state/composer/index.ts';
import { composerRowsAtom, composerTopAtom, layoutAtom } from '@state/homeScreen/index.ts';
import { columnsAtom, inputLockedAtom } from '@state/global/index.ts';

type PromptComposerProps = {
  columns?: number;
  onSubmit?: (prompt: string) => void;
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
  isActive,
  maxBytes = PROMPT_MAX_BYTES,
  maxVisibleLines,
  cursorTop,
  onVisibleRowsChange
}: PromptComposerProps) {
  const state = useAtomValue(composerStateAtom);
  const atomColumns = useAtomValue(columnsAtom);
  const atomInputLocked = useAtomValue(inputLockedAtom);
  const atomLayout = useAtomValue(layoutAtom);
  const atomComposerTop = useAtomValue(composerTopAtom);
  const enqueuePrompt = useSetAtom(enqueuePromptAtom);
  const setComposerRows = useSetAtom(composerRowsAtom);
  const composerRef = useRef<DOMElement | null>(null);
  const composerMetrics = useBoxMetrics(composerRef);
  const { setCursorPosition } = useCursor();

  const resolvedColumns = columns ?? atomColumns;
  const resolvedSubmit = onSubmit ?? ((prompt: string) => void enqueuePrompt(prompt));
  const resolvedIsActive = isActive ?? !atomInputLocked;
  const resolvedMaxVisibleLines = maxVisibleLines ?? atomLayout.composerVisibleRows ?? DEFAULT_COMPOSER_VISIBLE_LINES;
  const resolvedCursorTop = cursorTop ?? atomComposerTop;
  const resolvedVisibleRowsChange = onVisibleRowsChange ?? setComposerRows;

  usePromptComposerInput({ isActive: resolvedIsActive, maxBytes, onSubmit: resolvedSubmit, state });

  const inputColumns = Math.max(1, resolvedColumns - PROMPT_PREFIX.length);
  const visiblePrompt = formatVisiblePromptView(
    state.text,
    inputColumns,
    resolvedMaxVisibleLines,
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
    resolvedVisibleRowsChange?.(visibleRows);
  }, [resolvedVisibleRowsChange, visibleRows]);

  if (resolvedIsActive && composerMetrics.hasMeasured) {
    setCursorPosition(
      resolveComposerCursorPosition(
        visibleText,
        inputColumns,
        resolvedCursorTop ?? composerMetrics.top,
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
        columns={resolvedColumns}
        shouldRenderBackground={shouldRenderBackground}
        validationError={state.validationError}
        visibleTextRows={visibleText.split('\n')}
      />
    </Box>
  );
}
