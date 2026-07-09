import { Box, useApp, useBoxMetrics, useCursor } from 'ink';
import { useAtomValue, useSetAtom } from 'jotai';
import type { DOMElement } from 'ink';
import { useEffect, useMemo, useRef } from 'react';
import { ComposerFrame } from '@components/PromptComposer/ComposerFrame.tsx';
import { PROMPT_PREFIX } from '@constants/ui.ts';
import { resolveComposerCursorPosition } from '@components/PromptComposer/cursorPosition.ts';
import {
  countVisibleComposerRows,
  formatVisiblePrompt
} from '@components/PromptComposer/promptTextView.ts';
import { usePromptComposerInput } from '@components/PromptComposer/usePromptComposerInput.ts';
import { usePasteInput } from '@components/PromptComposer/usePasteInput.ts';
import { useComposerCaretVisibility } from '@components/PromptComposer/useComposerCaretVisibility.ts';
import { DEFAULT_COMPOSER_VISIBLE_LINES } from '@constants/ui.ts';
import {
  clearTranscriptAtom,
  enqueuePromptAtom,
  restoreComposerDraftAtom
} from '@state/promptQueue/index.ts';
import { openHelpAtom } from '@state/ui/help/index.ts';
import { openLoginSurfaceAtom, openMemorySurfaceAtom, openModelSurfaceAtom, openResumeSurfaceAtom, openThemeSurfaceAtom } from '@state/ui/surface/index.ts';
import {
  MemoryMode,
  PendingMemoryItemAction,
  openAddMemoryFormAtom,
  setPendingMemoryItemActionAtom
} from '@state/ui/memory/index.ts';
import { CommandMemoryMode } from '@libs/commands/executeCommand.ts';
import { PROMPT_MAX_BYTES } from '@libs/composer/promptText.ts';
import { resolveComposerWindow } from '@libs/composer/composerWindow.ts';
import { subscribeComposerSubmitCapture } from '@libs/composer/submitCapture.ts';
import {
  appendComposerRecallSubmitAtom,
  caretSuppressedWhileScrollingAtom,
  composerScrollOffsetRowsAtom,
  composerStateAtom
} from '@state/ui/composer/index.ts';
import { composerInputColumnsAtom, composerRowsAtom, composerTopAtom, layoutAtom, scrollComposerCursorIntoViewAtom } from '@state/ui/index.ts';
import { copyModeActiveAtom, inputLockedAtom, safeChromeColumnsAtom } from '@state/ui/index.ts';

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
  const scrollOffsetRows = useAtomValue(composerScrollOffsetRowsAtom);
  // Hide the caret while the user is actively scrolling (body or composer) and
  // re-show it once scrolling settles, so the terminal cursor's blink is not
  // reset on every scrolled frame. Subscribing here also re-renders the composer
  // when suppression toggles, which re-asserts the caret after a scroll — Ink
  // only draws the cursor on a frame where setCursorPosition ran (its cursorDirty
  // flag resets each render).
  const caretSuppressed = useAtomValue(caretSuppressedWhileScrollingAtom);
  const atomColumns = useAtomValue(safeChromeColumnsAtom);
  const atomInputColumns = useAtomValue(composerInputColumnsAtom);
  const atomInputLocked = useAtomValue(inputLockedAtom);
  const copyModeActive = useAtomValue(copyModeActiveAtom);
  const atomLayout = useAtomValue(layoutAtom);
  const atomComposerTop = useAtomValue(composerTopAtom);
  const restoreDraft = useAtomValue(restoreComposerDraftAtom);
  const enqueuePrompt = useSetAtom(enqueuePromptAtom);
  const setRestoreDraft = useSetAtom(restoreComposerDraftAtom);
  const setComposerState = useSetAtom(composerStateAtom);
  const setComposerScrollOffsetRows = useSetAtom(composerScrollOffsetRowsAtom);
  const setComposerRows = useSetAtom(composerRowsAtom);
  const appendComposerRecallSubmit = useSetAtom(appendComposerRecallSubmitAtom);
  const scrollCursorIntoView = useSetAtom(scrollComposerCursorIntoViewAtom);
  const { exit } = useApp();
  const clearTranscript = useSetAtom(clearTranscriptAtom);
  const openHelp = useSetAtom(openHelpAtom);
  const openLogin = useSetAtom(openLoginSurfaceAtom);
  const openModel = useSetAtom(openModelSurfaceAtom);
  const openResume = useSetAtom(openResumeSurfaceAtom);
  const openMemory = useSetAtom(openMemorySurfaceAtom);
  const openAddMemoryForm = useSetAtom(openAddMemoryFormAtom);
  const setPendingMemoryItemAction = useSetAtom(setPendingMemoryItemActionAtom);
  const openTheme = useSetAtom(openThemeSurfaceAtom);
  const composerRef = useRef<DOMElement | null>(null);
  const composerMetrics = useBoxMetrics(composerRef);
  const { setCursorPosition } = useCursor();

  const resolvedColumns = columns ?? atomColumns;
  const resolvedSubmit: (prompt: string, submissionSequence?: number) => void =
    onSubmit === undefined
      ? (prompt: string, submissionSequence?: number) =>
          void enqueuePrompt(
            submissionSequence === undefined ? prompt : { text: prompt, submissionSequence }
          )
      : (prompt: string) => onSubmit(prompt);
  const resolvedIsActive = isActive ?? (!atomInputLocked && !copyModeActive);
  const resolvedMaxVisibleLines = maxVisibleLines ?? atomLayout.composerVisibleRows ?? DEFAULT_COMPOSER_VISIBLE_LINES;
  const resolvedCursorTop = cursorTop ?? atomComposerTop;
  const resolvedVisibleRowsChange = onVisibleRowsChange ?? setComposerRows;

  const commandActions = useMemo(
    () => ({
      exit,
      clearTranscript,
      showHelp: openHelp,
      openLogin,
      openModel,
      openResume,
      openMemory: (mode?: CommandMemoryMode) =>
        openMemory(mode === CommandMemoryMode.Inbox ? MemoryMode.Inbox : MemoryMode.Active),
      openMemoryAdd: () => {
        openMemory(MemoryMode.Active);
        openAddMemoryForm();
      },
      openMemoryEdit: () => {
        openMemory(MemoryMode.Active);
        setPendingMemoryItemAction(PendingMemoryItemAction.Edit);
      },
      openTheme
    }),
    [
      exit,
      clearTranscript,
      openHelp,
      openLogin,
      openModel,
      openResume,
      openMemory,
      openAddMemoryForm,
      setPendingMemoryItemAction,
      openTheme
    ]
  );

  useEffect(() => {
    if (restoreDraft.length === 0) {
      return;
    }
    setComposerState({
      text: restoreDraft,
      cursorIndex: restoreDraft.length,
      validationError: null
    });
    setComposerScrollOffsetRows(0);
    setRestoreDraft('');
  }, [restoreDraft, setComposerScrollOffsetRows, setComposerState, setRestoreDraft]);

  useEffect(
    () => subscribeComposerSubmitCapture((submit) => appendComposerRecallSubmit(submit)),
    [appendComposerRecallSubmit]
  );

  usePromptComposerInput({
    isActive: resolvedIsActive,
    maxBytes,
    onSubmit: resolvedSubmit,
    state,
    commandActions
  });
  usePasteInput({ maxBytes });
  // Keeps the terminal caret in sync with focus: re-asserts it on chrome
  // repaints (so it never drops off the prompt), and hides it while input is
  // locked during backend loading. See the hook for the full rationale.
  useComposerCaretVisibility();

  const inputColumns = columns === undefined ? atomInputColumns : Math.max(1, resolvedColumns - PROMPT_PREFIX.length);
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

  // Show the caret only when the composer is active. While input is locked
  // (backend loading) resolvedIsActive is false, so no position is set and the
  // terminal cursor stays hidden — useComposerCaretVisibility hides it
  // explicitly because Ink won't — and the caret returns once the backend is
  // ready. Copy Mode also releases the caret to the terminal for native
  // selection.
  if (
    resolvedIsActive &&
    composerMetrics.hasMeasured &&
    composerWindow.cursorVisible &&
    !caretSuppressed
  ) {
    setCursorPosition(
      resolveComposerCursorPosition(
        visibleText,
        inputColumns,
        resolvedCursorTop ?? composerMetrics.top,
        composerWindow.cursorIndex,
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
        visibleTextRows={visibleTextRows}
      />
    </Box>
  );
}
