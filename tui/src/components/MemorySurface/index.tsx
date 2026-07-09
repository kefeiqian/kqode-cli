import { Box, Text } from 'ink';
import { useAtomValue, useSetAtom } from 'jotai';
import { useEffect, useMemo } from 'react';
import type { MemoryInboxEntry, MemoryItem } from '@contracts/backend/index.ts';
import { InboxRows } from '@components/MemorySurface/InboxRows.tsx';
import { MemoryForm } from '@components/MemorySurface/MemoryForm.tsx';
import { MemoryRows } from '@components/MemorySurface/MemoryRows.tsx';
import { useMemoryBackend } from '@components/MemorySurface/useMemoryBackend.ts';
import { useMemoryFormInput } from '@components/MemorySurface/useMemoryFormInput.ts';
import { useMemoryInput } from '@components/MemorySurface/useMemoryInput.ts';
import { columnsAtom, rowsAtom, safeChromeColumnsAtom } from '@state/ui/index.ts';
import {
  MemoryMode,
  MemoryStatus,
  forgetConfirmAtom,
  highlightedInboxEntryAtom,
  highlightedMemoryItemAtom,
  memoryDetailBodyAtom,
  memoryErrorAtom,
  memoryFormAtom,
  memoryModeAtom,
  pendingMemoryItemActionAtom,
  memoryStatusAtom,
  memoryVisibleRowsAtom,
  visibleInboxEntriesAtom,
  visibleMemoryItemsAtom
} from '@state/ui/memory/index.ts';
import { activeThemeAtom } from '@state/global/index.ts';

const HEADER_ROWS = 4;
const FOOTER_ROWS = 1;

export function MemorySurface() {
  const columns = useAtomValue(columnsAtom);
  const safeChromeColumns = useAtomValue(safeChromeColumnsAtom);
  const rows = useAtomValue(rowsAtom);
  const mode = useAtomValue(memoryModeAtom);
  const status = useAtomValue(memoryStatusAtom);
  const error = useAtomValue(memoryErrorAtom);
  const items = useAtomValue(visibleMemoryItemsAtom);
  const entries = useAtomValue(visibleInboxEntriesAtom);
  const highlightedItem = useAtomValue(highlightedMemoryItemAtom);
  const highlightedEntry = useAtomValue(highlightedInboxEntryAtom);
  const detailBody = useAtomValue(memoryDetailBodyAtom);
  const form = useAtomValue(memoryFormAtom);
  const pendingAction = useAtomValue(pendingMemoryItemActionAtom);
  const forgetConfirm = useAtomValue(forgetConfirmAtom);
  const theme = useAtomValue(activeThemeAtom);
  const setVisibleRows = useSetAtom(memoryVisibleRowsAtom);
  const { refresh, showDetail, forgetItem, addItem, beginEdit, editItem, applyInbox, undoInbox } = useMemoryBackend();
  const bodyRows = useMemo(() => Math.max(1, rows - HEADER_ROWS - FOOTER_ROWS), [rows]);
  // The list area renders a table header on its first line, so the data-row
  // capacity that drives the scroll window is one less than the rendered height.
  const listRows = Math.max(1, bodyRows - 1);
  const dataRows = Math.max(1, listRows - 1);

  useMemoryInput({ refresh, showDetail, forgetItem, beginEdit, applyInbox, undoInbox });
  useMemoryFormInput({ addItem, editItem });

  useEffect(() => {
    setVisibleRows(dataRows);
  }, [dataRows, setVisibleRows]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <Box flexDirection="column" width={columns} height={rows} backgroundColor={theme.colors.bodyBackground}>
      <Text color={theme.colors.accentBlue}>/memory</Text>
      <Text>{modeTabs(mode)}</Text>
      <Text color={theme.colors.muted}>{statusLine(status, error, pendingAction)}</Text>
      <Text> </Text>
      {forgetConfirm !== null ? (
        <ForgetConfirm columns={safeChromeColumns} item={forgetConfirm} />
      ) : form !== null ? (
        <MemoryForm columns={safeChromeColumns} form={form} />
      ) : (
        renderBody({ status, error, mode, detailBody, items, entries, highlightedItem, highlightedEntry, columns: safeChromeColumns, listRows })
      )}
      <MemoryFooter columns={safeChromeColumns} mode={mode} detailOpen={detailBody !== null} />
    </Box>
  );
}

type BodyProps = {
  status: MemoryStatus;
  error: string | null;
  mode: MemoryMode;
  detailBody: string | null;
  items: readonly MemoryItem[];
  entries: readonly MemoryInboxEntry[];
  highlightedItem: MemoryItem | null;
  highlightedEntry: MemoryInboxEntry | null;
  columns: number;
  listRows: number;
};

function renderBody(props: BodyProps) {
  const { status, error, mode, detailBody, items, entries, highlightedItem, highlightedEntry, columns, listRows } = props;
  if (detailBody !== null) {
    return <MemoryDetail columns={columns} rows={listRows} body={detailBody} />;
  }
  if (status !== MemoryStatus.Loaded) {
    return <BodyMessage columns={columns} rows={listRows} text={bodyMessage(status, error, mode)} />;
  }
  return mode === MemoryMode.Active ? (
    <MemoryRows columns={columns} items={items} visibleRows={listRows} highlightedId={highlightedItem?.id ?? null} />
  ) : (
    <InboxRows columns={columns} entries={entries} visibleRows={listRows} highlightedId={highlightedEntry?.id ?? null} />
  );
}

function MemoryDetail({ columns, rows, body }: { columns: number; rows: number; body: string }) {
  const lines = body.split('\n').map((line) => line.slice(0, columns));
  return (
    <Box flexDirection="column" height={rows}>
      {Array.from({ length: rows }, (_, index) => (
        <Text key={index}>{lines[index] ?? ' '}</Text>
      ))}
    </Box>
  );
}

function BodyMessage({ columns, rows, text }: { columns: number; rows: number; text: string }) {
  return (
    <Box flexDirection="column" height={rows}>
      <Text>{text.slice(0, columns)}</Text>
      {Array.from({ length: Math.max(0, rows - 1) }, (_, index) => (
        <Text key={index}> </Text>
      ))}
    </Box>
  );
}

function ForgetConfirm({ columns, item }: { columns: number; item: MemoryItem }) {
  const theme = useAtomValue(activeThemeAtom);
  return (
    <Box width={columns}>
      <Text color={theme.colors.errorRed}>
        {`Forget "${item.title}" from Active memory? y forget · n/enter/esc cancel`.slice(0, columns)}
      </Text>
    </Box>
  );
}

function MemoryFooter({ columns, mode, detailOpen }: { columns: number; mode: MemoryMode; detailOpen: boolean }) {
  const theme = useAtomValue(activeThemeAtom);

  return (
    <Box width={columns}>
      <Text color={theme.colors.muted}>{footerHint(mode, detailOpen).slice(0, columns)}</Text>
    </Box>
  );
}

function modeTabs(mode: MemoryMode): string {
  const active = mode === MemoryMode.Active ? '[Active]' : 'Active';
  const inbox = mode === MemoryMode.Inbox ? '[Inbox]' : 'Inbox';
  return `${active}  ${inbox}`;
}

function statusLine(status: MemoryStatus, error: string | null, pendingAction: string | null = null): string {
  if (pendingAction === 'edit') {
    return 'Pick a memory to edit · enter choose · esc cancel';
  }
  if (pendingAction === 'forget') {
    return 'Pick a memory to forget · enter choose · esc cancel';
  }
  switch (status) {
    case MemoryStatus.Loading:
      return 'Loading memory…';
    case MemoryStatus.Busy:
      return 'Working…';
    case MemoryStatus.Failed:
      return error ?? 'Failed to load memory.';
    case MemoryStatus.Empty:
      return 'Local memory · user + repo scope';
    case MemoryStatus.Loaded:
      return 'Local memory · user + repo scope';
  }
}

function bodyMessage(status: MemoryStatus, error: string | null, mode: MemoryMode): string {
  switch (status) {
    case MemoryStatus.Loading:
      return 'Loading memory…';
    case MemoryStatus.Busy:
      return 'Working…';
    case MemoryStatus.Failed:
      return error ?? 'Failed to load memory.';
    case MemoryStatus.Empty:
      return mode === MemoryMode.Active
        ? 'No memory yet. Add memory with /memory add.'
        : 'No inbox entries. Automatic extraction will propose updates here.';
    case MemoryStatus.Loaded:
      return '';
  }
}

function footerHint(mode: MemoryMode, detailOpen: boolean): string {
  if (detailOpen) {
    return 'enter/q back · esc close';
  }
  return mode === MemoryMode.Active
    ? '↑/↓ choose · enter view · x forget · tab inbox · r reload · esc close'
    : '↑/↓ choose · a approve · j reject · s stale · u undo · tab active · r reload · esc close';
}
