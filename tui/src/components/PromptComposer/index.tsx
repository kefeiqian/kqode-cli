import { Box, useApp, useBoxMetrics } from 'ink';
import { useAtomValue, useSetAtom } from 'jotai';
import type { DOMElement } from 'ink';
import { useEffect, useMemo, useRef } from 'react';
import { ComposerCaret } from '@components/PromptComposer/ComposerCaret.tsx';
import { ComposerFrame } from '@components/PromptComposer/ComposerFrame.tsx';
import { PROMPT_PREFIX } from '@constants/ui.ts';
import { usePromptComposerInput } from '@hooks/promptComposer/usePromptComposerInput.ts';
import { resolveComposerCursorPosition } from '@libs/composer/cursorPosition.ts';
import { resolveComposerInputColumns } from '@libs/composer/layout.ts';
import { countVisibleComposerRows } from '@libs/composer/promptTextView.ts';
import { DEFAULT_COMPOSER_VISIBLE_LINES } from '@constants/ui.ts';
import { clearTranscriptAtom, enqueuePromptAtom } from '@state/promptQueue/index.ts';
import { openHelpAtom } from '@state/ui/help/index.ts';
import { PROMPT_MAX_BYTES } from '@libs/composer/promptText.ts';
import { resolveComposerWindow } from '@libs/composer/composerWindow.ts';
import {
  composerScrollOffsetRowsAtom,
  composerStateAtom
} from '@state/ui/composer/index.ts';
import { composerRowsAtom, composerTopAtom, layoutAtom, scrollComposerCursorIntoViewAtom } from '@state/ui/index.ts';
import { chromeColumnsAtom, inputLockedAtom } from '@state/ui/index.ts';
import { resolveChromeColumns } from '@libs/tui/layout.ts';

type PromptComposerProps = {
  columns?: number;
  onSubmit?: (prompt: string) => void;
  isActive?: boolean;
  maxBytes?: number;
  maxVisibleLines?: number;
  cursorTop?: number;
  onVisibleRowsChange?: (rows: number) => void;
};

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
  const scrollOffsetRows = useAtomValue(composerScrollOffsetRowsAtom);
  const atomColumns = useAtomValue(chromeColumnsAtom);
  const atomInputLocked = useAtomValue(inputLockedAtom);
  const atomLayout = useAtomValue(layoutAtom);
  const atomComposerTop = useAtomValue(composerTopAtom);
  const enqueuePrompt = useSetAtom(enqueuePromptAtom);
  const setComposerRows = useSetAtom(composerRowsAtom);
  const scrollCursorIntoView = useSetAtom(scrollComposerCursorIntoViewAtom);
  const { exit } = useApp();
  const clearTranscript = useSetAtom(clearTranscriptAtom);
  const openHelp = useSetAtom(openHelpAtom);
  const composerRef = useRef<DOMElement | null>(null);
  const composerMetrics = useBoxMetrics(composerRef);

  const resolvedColumns = columns === undefined ? atomColumns : resolveChromeColumns(columns);
  const resolvedSubmit = onSubmit ?? ((prompt: string) => void enqueuePrompt(prompt));
  const resolvedIsActive = isActive ?? !atomInputLocked;
  const resolvedMaxVisibleLines = maxVisibleLines ?? atomLayout.composerVisibleRows ?? DEFAULT_COMPOSER_VISIBLE_LINES;
  const resolvedCursorTop = cursorTop ?? atomComposerTop;
  const resolvedVisibleRowsChange = onVisibleRowsChange ?? setComposerRows;

  const commandActions = useMemo(
    () => ({ exit, clearTranscript, showHelp: openHelp }),
    [exit, clearTranscript, openHelp]
  );

  usePromptComposerInput({
    isActive: resolvedIsActive,
    maxBytes,
    onSubmit: resolvedSubmit,
    state,
    commandActions
  });

  const inputColumns = resolveComposerInputColumns(resolvedColumns);
  const composerWindow = resolveComposerWindow({
    text: state.text,
    columns: inputColumns,
    maxVisibleLines: resolvedMaxVisibleLines,
    cursorIndex: state.cursorIndex,
    offset: scrollOffsetRows
  });
  const visibleText = composerWindow.text;
  const visibleTextRows = visibleText.split('\n');
  const shouldRenderBackground = true;
  const visibleRows = countVisibleComposerRows(
    visibleTextRows.length,
    state.validationError !== null,
    shouldRenderBackground
  );

  useEffect(() => {
    resolvedVisibleRowsChange?.(visibleRows);
  }, [resolvedVisibleRowsChange, visibleRows]);

  // Keep the caret visible after an edit or cursor move without snapping the
  // view to the bottom: only a change that leaves the caret off-window scrolls
  // (minimally, to the nearest edge). Keyed on text too, not just cursorIndex,
  // because compound edits (e.g. bare Enter replacing a trailing `\` with a
  // newline) change the text and the caret's row while leaving cursorIndex net
  // unchanged. Wheel scrolling changes neither, so peeking is preserved.
  useEffect(() => {
    scrollCursorIntoView();
  }, [state.cursorIndex, state.text, scrollCursorIntoView]);

  const caretPosition =
    resolvedIsActive &&
    composerMetrics.hasMeasured &&
    composerWindow.cursorVisible
      ? resolveComposerCursorPosition(
          visibleText,
          inputColumns,
          resolvedCursorTop ?? composerMetrics.top,
          composerWindow.cursorIndex,
          shouldRenderBackground
        )
      : undefined;

  return (
    <Box ref={composerRef} flexDirection="column">
      <ComposerCaret position={caretPosition} />
      <ComposerFrame
        columns={resolvedColumns}
        shouldRenderBackground={shouldRenderBackground}
        validationError={state.validationError}
        visibleTextRows={visibleTextRows}
      />
    </Box>
  );
}
