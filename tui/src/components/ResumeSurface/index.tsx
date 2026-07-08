import { Box, Text } from 'ink';
import { useAtomValue, useSetAtom } from 'jotai';
import { useEffect, useMemo } from 'react';
import { ResumeRows } from '@components/ResumeSurface/ResumeRows.tsx';
import { useResumeBackend } from '@components/ResumeSurface/useResumeBackend.ts';
import { useResumeInput } from '@components/ResumeSurface/useResumeInput.ts';
import { columnsAtom, rowsAtom, safeChromeColumnsAtom } from '@state/ui/index.ts';
import {
  highlightedResumeSessionAtom,
  ResumeStatus,
  resumeErrorAtom,
  resumeSessionsAtom,
  resumeStatusAtom,
  resumeVisibleRowsAtom,
  visibleResumeSessionsAtom
} from '@state/ui/resume/index.ts';
import { theme } from '@theme/themeConfig.ts';

const HEADER_ROWS = 4;
const FOOTER_ROWS = 1;
const RESUME_FOOTER_HINT = '↑/↓ choose · enter resume · esc close';

export function ResumeSurface() {
  const columns = useAtomValue(columnsAtom);
  const safeChromeColumns = useAtomValue(safeChromeColumnsAtom);
  const rows = useAtomValue(rowsAtom);
  const allSessions = useAtomValue(resumeSessionsAtom);
  const visibleSessions = useAtomValue(visibleResumeSessionsAtom);
  const highlighted = useAtomValue(highlightedResumeSessionAtom);
  const status = useAtomValue(resumeStatusAtom);
  const error = useAtomValue(resumeErrorAtom);
  const setVisibleRows = useSetAtom(resumeVisibleRowsAtom);
  const { refreshSessions, resumeSelected } = useResumeBackend();
  const bodyRows = useMemo(() => Math.max(1, rows - HEADER_ROWS - FOOTER_ROWS), [rows]);
  const hiddenCurrentDraft = status === ResumeStatus.Loaded && allSessions.length > 0 && !allSessions.some((session) => session.status === 'Current');

  useResumeInput(resumeSelected);

  useEffect(() => {
    setVisibleRows(Math.max(1, bodyRows - 1));
  }, [bodyRows, setVisibleRows]);

  useEffect(() => {
    void refreshSessions();
  }, [refreshSessions]);

  return (
    <Box flexDirection="column" width={columns} height={rows} backgroundColor={theme.colors.bodyBackground}>
      <Text color={theme.colors.accentBlue}>/resume</Text>
      <Text color={theme.colors.muted}>Resume a saved local session.</Text>
      <Text color={theme.colors.muted}>
        {hiddenCurrentDraft
          ? 'Current draft is not listed until you submit its first prompt.'
          : statusLine(status, error)}
      </Text>
      <Text> </Text>
      {status === ResumeStatus.Loaded ? (
        <ResumeRows
          columns={safeChromeColumns}
          sessions={visibleSessions}
          visibleRows={Math.max(1, bodyRows - 1)}
          highlightedSessionId={highlighted?.sessionId ?? null}
        />
      ) : (
        <ResumeBodyMessage columns={safeChromeColumns} rows={Math.max(1, bodyRows - 1)} text={bodyMessage(status, error)} />
      )}
      <ResumeFooter columns={safeChromeColumns} />
    </Box>
  );
}

function ResumeBodyMessage({ columns, rows, text }: { columns: number; rows: number; text: string }) {
  return (
    <Box flexDirection="column" height={rows}>
      <Text>{text.slice(0, columns)}</Text>
      {Array.from({ length: Math.max(0, rows - 1) }, (_, index) => (
        <Text key={index}> </Text>
      ))}
    </Box>
  );
}

function ResumeFooter({ columns }: { columns: number }) {
  return (
    <Box width={columns}>
      <Text color={theme.colors.muted}>{RESUME_FOOTER_HINT}</Text>
    </Box>
  );
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
      return 'Local sessions only · newest modified first';
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
