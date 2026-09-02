import os from 'node:os';
import { Box, Text } from 'ink';
import { useAtomValue } from 'jotai';
import { SelectableRow } from '@components/SelectableRow/index.tsx';
import { SELECTION_GUTTER_WIDTH } from '@constants/ui.ts';
import type { SessionSummary } from '@contracts/backend/index.ts';
import { formatResumeRow } from '@libs/resume/formatSessionRows.ts';
import { resumeFolderContentWidthAtom } from '@state/ui/resume/index.ts';

export function ResumeRows({
  columns,
  sessions,
  visibleRows,
  highlightedSessionId,
  startIndex = 0
}: {
  columns: number;
  sessions: readonly SessionSummary[];
  visibleRows: number;
  highlightedSessionId: string | null;
  startIndex?: number;
}) {
  const homeDir = os.homedir();
  const folderContentWidth = useAtomValue(resumeFolderContentWidthAtom);
  const contentColumns = columns - SELECTION_GUTTER_WIDTH;
  return (
    <Box flexDirection="column" height={visibleRows}>
      {Array.from({ length: visibleRows }, (_, index) => {
        const session = sessions[index];
        if (session === undefined) {
          return <Text key={index}> </Text>;
        }
        return (
          <SelectableRow
            key={session.sessionId}
            highlighted={session.sessionId === highlightedSessionId}
            content={formatResumeRow(session, startIndex + index, contentColumns, homeDir, folderContentWidth)}
          />
        );
      })}
    </Box>
  );
}
