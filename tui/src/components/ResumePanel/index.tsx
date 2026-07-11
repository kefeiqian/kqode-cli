import { Box, Text } from 'ink';
import { useAtomValue, useSetAtom } from 'jotai';
import { useEffect } from 'react';
import { CommandSurface } from '@components/CommandSurface/index.tsx';
import { useCommandSurfaceLayout } from '@components/CommandSurface/useCommandSurfaceLayout.ts';
import { ResumeRows } from '@components/ResumeSurface/ResumeRows.tsx';
import { useResumeBackend } from '@components/ResumeSurface/useResumeBackend.ts';
import { useResumeInput } from '@components/ResumeSurface/useResumeInput.ts';
import { positionIndicator } from '@libs/tui/layout.ts';
import {
  RESUME_PANEL_CHROME_ROWS,
  RESUME_PANEL_SESSION_ROWS,
  SELECTION_GUTTER,
  SELECTION_GUTTER_WIDTH
} from '@constants/ui.ts';
import { formatResumeHeader } from '@libs/resume/formatSessionRows.ts';
import { resumePanelRowsAtom, safeChromeColumnsAtom } from '@state/ui/index.ts';
import {
  highlightedResumeSessionAtom,
  ResumeStatus,
  resumeErrorAtom,
  resumeSessionsAtom,
  resumeStatusAtom,
  resumeVisibleRowsAtom,
  resumeWindowOffsetAtom,
  visibleResumeSessionsAtom
} from '@state/ui/resume/index.ts';

const RESUME_LABEL = 'Resume Session:';
const RESUME_FOOTER_HINT = '↑/↓ choose · enter resume · esc close';

export function ResumePanel() {
  const safeChromeColumns = useAtomValue(safeChromeColumnsAtom);
  const panelRows = useAtomValue(resumePanelRowsAtom);
  const allSessions = useAtomValue(resumeSessionsAtom);
  const visibleSessions = useAtomValue(visibleResumeSessionsAtom);
  const highlighted = useAtomValue(highlightedResumeSessionAtom);
  const status = useAtomValue(resumeStatusAtom);
  const error = useAtomValue(resumeErrorAtom);
  const windowOffset = useAtomValue(resumeWindowOffsetAtom);
  const setVisibleRows = useSetAtom(resumeVisibleRowsAtom);
  const { refreshSessions, resumeSelected } = useResumeBackend();
  const layout = useCommandSurfaceLayout({ panelRows, chromeWithGap: RESUME_PANEL_CHROME_ROWS });
  const sessionRows = Math.max(1, Math.min(RESUME_PANEL_SESSION_ROWS, layout.bodyRows));
  const hiddenCurrentDraft =
    status === ResumeStatus.Loaded &&
    allSessions.length > 0 &&
    !allSessions.some((session) => session.status === 'Current');
  // The session table's column header lives in the shell header slot (counted in
  // RESUME_PANEL_CHROME_ROWS) so the fixed-height body holds only session rows; a
  // blank row keeps the same budget in the non-loaded states.
  const header =
    status === ResumeStatus.Loaded ? (
      <Text>{`${SELECTION_GUTTER}${formatResumeHeader(safeChromeColumns - SELECTION_GUTTER_WIDTH)}`}</Text>
    ) : (
      <Text> </Text>
    );

  useResumeInput(resumeSelected);

  useEffect(() => {
    setVisibleRows(sessionRows);
  }, [sessionRows, setVisibleRows]);

  useEffect(() => {
    void refreshSessions();
  }, [refreshSessions]);

  return (
    <CommandSurface
      panelRows={panelRows}
      layout={layout}
      label={truncate(labelText(status, error, hiddenCurrentDraft), safeChromeColumns)}
      header={header}
      bodyRows={sessionRows}
      footerHint={RESUME_FOOTER_HINT}
      position={positionIndicator(windowOffset, Math.max(0, allSessions.length - sessionRows))}
    >
      {status === ResumeStatus.Loaded ? (
        <ResumeRows
          columns={safeChromeColumns}
          highlightedSessionId={highlighted?.sessionId ?? null}
          sessions={visibleSessions}
          startIndex={windowOffset}
          visibleRows={sessionRows}
        />
      ) : (
        <PanelMessage rows={sessionRows} text={bodyMessage(status, error)} />
      )}
    </CommandSurface>
  );
}

function PanelMessage({ rows, text }: { rows: number; text: string }) {
  const columns = useAtomValue(safeChromeColumnsAtom);

  return (
    <Box flexDirection="column" height={rows}>
      <Text>{truncate(text, columns)}</Text>
      {Array.from({ length: Math.max(0, rows - 1) }, (_, index) => (
        <Text key={index}> </Text>
      ))}
    </Box>
  );
}

function labelText(status: ResumeStatus, error: string | null, hiddenCurrentDraft: boolean): string {
  if (hiddenCurrentDraft) {
    return `${RESUME_LABEL} Current draft is not listed until you submit its first prompt.`;
  }
  if (status === ResumeStatus.Loaded) {
    return RESUME_LABEL;
  }
  return `${RESUME_LABEL} ${statusLine(status, error)}`;
}

function statusLine(status: ResumeStatus, error: string | null): string {
  switch (status) {
    case ResumeStatus.Loading:
      return 'Loading saved sessions...';
    case ResumeStatus.Resuming:
      return 'Resuming session...';
    case ResumeStatus.Failed:
      return error ?? 'Failed to load saved sessions.';
    case ResumeStatus.Empty:
      return 'No saved sessions yet.';
    case ResumeStatus.Loaded:
      return '';
  }
}

function bodyMessage(status: ResumeStatus, error: string | null): string {
  switch (status) {
    case ResumeStatus.Loading:
      return 'Loading saved sessions...';
    case ResumeStatus.Resuming:
      return 'Resuming session...';
    case ResumeStatus.Failed:
      return error ?? 'Failed to load saved sessions.';
    case ResumeStatus.Empty:
      return 'No saved local sessions yet. Submit your first prompt to create one.';
    case ResumeStatus.Loaded:
      return '';
  }
}

function truncate(text: string, columns: number): string {
  return text.slice(0, Math.max(0, columns));
}
