import os from 'node:os';
import { Box, Text } from 'ink';
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
  const lines = [
    formatResumeHeader(columns),
    ...sessions.map((session, index) => formatResumeRow(session, startIndex + index, columns, homeDir))
  ];
  return (
    <Box flexDirection="column" height={visibleRows + 1}>
      {Array.from({ length: visibleRows + 1 }, (_, index) => {
        const line = lines[index];
        if (line === undefined) {
          return <Text key={index}> </Text>;
        }
        const session = index === 0 ? null : sessions[index - 1];
        return (
          <Text key={session?.sessionId ?? 'header'} inverse={session?.sessionId === highlightedSessionId}>
            {line}
          </Text>
        );
      })}
    </Box>
  );
}
