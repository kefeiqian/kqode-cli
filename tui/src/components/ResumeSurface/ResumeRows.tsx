import os from 'node:os';
import { Box, Text } from 'ink';
import { SelectableRow } from '@components/SelectableRow/index.tsx';
import { SELECTION_GUTTER, SELECTION_GUTTER_WIDTH } from '@constants/ui.ts';
import type { SessionSummary } from '@contracts/backend/index.ts';
import { formatResumeHeader, formatResumeRow } from '@libs/resume/formatSessionRows.ts';

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
  const contentColumns = columns - SELECTION_GUTTER_WIDTH;
  return (
    <Box flexDirection="column" height={visibleRows + 1}>
      {Array.from({ length: visibleRows + 1 }, (_, index) => {
        if (index === 0) {
          return <Text key="header">{`${SELECTION_GUTTER}${formatResumeHeader(contentColumns)}`}</Text>;
        }
        const session = sessions[index - 1];
        if (session === undefined) {
          return <Text key={index}> </Text>;
        }
        return (
          <SelectableRow
            key={session.sessionId}
            highlighted={session.sessionId === highlightedSessionId}
            content={formatResumeRow(session, startIndex + index - 1, contentColumns, homeDir)}
          />
        );
      })}
    </Box>
  );
}
