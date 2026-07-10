import { Box, Text } from 'ink';
import { useAtomValue, useSetAtom } from 'jotai';
import { useEffect } from 'react';
import { DockDivider } from '@components/DockDivider.tsx';
import { ResumeRows } from '@components/ResumeSurface/ResumeRows.tsx';
import { useResumeBackend } from '@components/ResumeSurface/useResumeBackend.ts';
import { useResumeInput } from '@components/ResumeSurface/useResumeInput.ts';
import { resolveDockedFooterGap } from '@libs/tui/layout.ts';
import {
  RESUME_PANEL_CHROME_ROWS,
  RESUME_PANEL_SESSION_ROWS
} from '@constants/ui.ts';
import { activeThemeAtom } from '@state/global/index.ts';
import { resumePanelRowsAtom, safeChromeColumnsAtom } from '@state/ui/index.ts';
import {
  highlightedResumeSessionAtom,
  ResumeStatus,
  resumeErrorAtom,
  resumePanelDesiredRowsAtom,
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
  const theme = useAtomValue(activeThemeAtom);
  const desiredRows = useAtomValue(resumePanelDesiredRowsAtom);
  const setVisibleRows = useSetAtom(resumeVisibleRowsAtom);
  const { refreshSessions, resumeSelected } = useResumeBackend();
  const { showFooterGap, chromeRows } = resolveDockedFooterGap({
    panelRows,
    desiredRows,
    chromeWithGap: RESUME_PANEL_CHROME_ROWS
  });
  const sessionRows = Math.max(1, Math.min(RESUME_PANEL_SESSION_ROWS, panelRows - chromeRows));
  const hiddenCurrentDraft =
    status === ResumeStatus.Loaded &&
    allSessions.length > 0 &&
    !allSessions.some((session) => session.status === 'Current');

  useResumeInput(resumeSelected);

  useEffect(() => {
    setVisibleRows(sessionRows);
  }, [sessionRows, setVisibleRows]);

  useEffect(() => {
    void refreshSessions();
  }, [refreshSessions]);

  return (
    <Box flexDirection="column" height={panelRows}>
      <DockDivider />
      <Text color={theme.colors.accentBlue}>
        {truncate(labelText(status, error, hiddenCurrentDraft), safeChromeColumns)}
      </Text>
      {status === ResumeStatus.Loaded ? (
        <ResumeRows
          columns={safeChromeColumns}
          highlightedSessionId={highlighted?.sessionId ?? null}
          sessions={visibleSessions}
          startIndex={windowOffset}
          visibleRows={sessionRows}
        />
      ) : (
        <PanelMessage rows={sessionRows + 1} text={bodyMessage(status, error)} />
      )}
      {showFooterGap ? <Text> </Text> : null}
      <ResumeFooter
        offset={windowOffset}
        total={allSessions.length}
        visible={sessionRows}
      />
    </Box>
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

function ResumeFooter({
  offset,
  total,
  visible
}: {
  offset: number;
  total: number;
  visible: number;
}) {
  const columns = useAtomValue(safeChromeColumnsAtom);
  const theme = useAtomValue(activeThemeAtom);
  const maxOffset = Math.max(0, total - visible);
  const position = maxOffset === 0 ? '' : offset <= 0 ? 'more ↓' : offset >= maxOffset ? 'more ↑' : 'more ↑↓';

  return (
    <Box width={columns}>
      <Text color={theme.colors.muted}>{RESUME_FOOTER_HINT}</Text>
      {position === '' ? null : (
        <Box flexGrow={1} justifyContent="flex-end">
          <Text color={theme.colors.muted}>{position}</Text>
        </Box>
      )}
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
