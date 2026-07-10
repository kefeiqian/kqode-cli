import { Box, Text } from 'ink';
import { useAtomValue, useSetAtom } from 'jotai';
import { useEffect } from 'react';
import type { MemoryInboxEntry, MemoryItem } from '@contracts/backend/index.ts';
import { DockDivider } from '@components/DockDivider.tsx';
import { InboxRows } from '@components/MemorySurface/InboxRows.tsx';
import { MemoryForm } from '@components/MemorySurface/MemoryForm.tsx';
import { MemoryRows } from '@components/MemorySurface/MemoryRows.tsx';
import { useMemoryBackend } from '@components/MemorySurface/useMemoryBackend.ts';
import { useMemoryFormInput } from '@components/MemorySurface/useMemoryFormInput.ts';
import { useMemoryInput } from '@components/MemorySurface/useMemoryInput.ts';
import { resolveDockedFooterGap } from '@libs/tui/layout.ts';
import { dockedPanelRowsAtom, safeChromeColumnsAtom } from '@state/ui/index.ts';
import {
  MEMORY_DOCK_LIST_CHROME_ROWS,
  MEMORY_DOCK_SUBSTATE_CHROME_ROWS,
  MemoryMode,
  MemoryStatus,
  forgetConfirmAtom,
  highlightedInboxEntryAtom,
  highlightedMemoryItemAtom,
  memoryDesiredRowsAtom,
  memoryDetailBodyAtom,
  memoryDetailOffsetAtom,
  memoryDetailVisibleRowsAtom,
  memoryErrorAtom,
  memoryFormAtom,
  memoryInboxAtom,
  memoryItemsAtom,
  memoryModeAtom,
  memorySubStateActiveAtom,
  memoryVisibleRowsAtom,
  memoryWindowOffsetAtom,
  pendingMemoryItemActionAtom,
  memoryStatusAtom
} from '@state/ui/memory/index.ts';
import { activeThemeAtom } from '@state/global/index.ts';

export function MemorySurface() {
  const safeChromeColumns = useAtomValue(safeChromeColumnsAtom);
  const panelRows = useAtomValue(dockedPanelRowsAtom);
  const mode = useAtomValue(memoryModeAtom);
  const status = useAtomValue(memoryStatusAtom);
  const error = useAtomValue(memoryErrorAtom);
  const allItems = useAtomValue(memoryItemsAtom);
  const allEntries = useAtomValue(memoryInboxAtom);
  const windowOffset = useAtomValue(memoryWindowOffsetAtom);
  const highlightedItem = useAtomValue(highlightedMemoryItemAtom);
  const highlightedEntry = useAtomValue(highlightedInboxEntryAtom);
  const detailBody = useAtomValue(memoryDetailBodyAtom);
  const detailOffset = useAtomValue(memoryDetailOffsetAtom);
  const form = useAtomValue(memoryFormAtom);
  const pendingAction = useAtomValue(pendingMemoryItemActionAtom);
  const forgetConfirm = useAtomValue(forgetConfirmAtom);
  const subStateActive = useAtomValue(memorySubStateActiveAtom);
  const theme = useAtomValue(activeThemeAtom);
  const desiredRows = useAtomValue(memoryDesiredRowsAtom);
  const setVisibleRows = useSetAtom(memoryVisibleRowsAtom);
  const setDetailVisibleRows = useSetAtom(memoryDetailVisibleRowsAtom);
  const { refresh, showDetail, forgetItem, addItem, beginEdit, editItem, applyInbox, undoInbox } = useMemoryBackend();

  // Form/detail/confirm sub-states drop the tabs+status chrome so the sub-state
  // keeps room within the half-height cap; the list keeps the full chrome. The
  // footer gap is only kept when the panel is at full height (not capped).
  const fullChrome = subStateActive ? MEMORY_DOCK_SUBSTATE_CHROME_ROWS : MEMORY_DOCK_LIST_CHROME_ROWS;
  const { showFooterGap, chromeRows } = resolveDockedFooterGap({
    panelRows,
    desiredRows,
    chromeWithGap: fullChrome
  });
  const bodyArea = Math.max(1, panelRows - chromeRows);
  // The list renders a table header on its first line, so data rows are one fewer.
  const dataRows = Math.max(1, bodyArea - 1);
  const listLength = mode === MemoryMode.Active ? allItems.length : allEntries.length;
  // Window at render time from `dataRows` (derived from the docked cap) so the
  // list doesn't flash a mis-windowed frame while the async load settles.
  const listOffset = Math.min(windowOffset, Math.max(0, listLength - dataRows));
  const items = allItems.slice(listOffset, listOffset + dataRows);
  const entries = allEntries.slice(listOffset, listOffset + dataRows);

  useMemoryInput({ refresh, showDetail, forgetItem, beginEdit, applyInbox, undoInbox });
  useMemoryFormInput({ addItem, editItem });

  useEffect(() => {
    setVisibleRows(dataRows);
    setDetailVisibleRows(bodyArea);
  }, [dataRows, bodyArea, setVisibleRows, setDetailVisibleRows]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const detailLines = detailBody === null ? 0 : detailBody.split('\n').length;
  const position = subStateActive
    ? detailBody === null
      ? ''
      : positionIndicator(detailOffset, Math.max(0, detailLines - bodyArea))
    : positionIndicator(listOffset, Math.max(0, listLength - dataRows));

  return (
    <Box flexDirection="column" height={panelRows} overflow="hidden">
      <DockDivider />
      <Text color={theme.colors.accentBlue}>/memory</Text>
      {subStateActive ? null : <Text wrap="truncate">{modeTabs(mode)}</Text>}
      {subStateActive ? null : (
        <Text color={theme.colors.muted} wrap="truncate">
          {statusLine(status, error, pendingAction)}
        </Text>
      )}
      <Box flexDirection="column" height={bodyArea} overflow="hidden">
        {forgetConfirm !== null ? (
          <ForgetConfirm columns={safeChromeColumns} item={forgetConfirm} />
        ) : form !== null ? (
          <MemoryForm columns={safeChromeColumns} form={form} />
        ) : detailBody !== null ? (
          <MemoryDetail columns={safeChromeColumns} rows={bodyArea} offset={detailOffset} body={detailBody} />
        ) : (
          renderBody({ status, error, mode, items, entries, highlightedItem, highlightedEntry, columns: safeChromeColumns, listRows: bodyArea })
        )}
      </Box>
      {showFooterGap ? <Text> </Text> : null}
      <MemoryFooter columns={safeChromeColumns} mode={mode} detailOpen={detailBody !== null} position={position} />
    </Box>
  );
}

type BodyProps = {
  status: MemoryStatus;
  error: string | null;
  mode: MemoryMode;
  items: readonly MemoryItem[];
  entries: readonly MemoryInboxEntry[];
  highlightedItem: MemoryItem | null;
  highlightedEntry: MemoryInboxEntry | null;
  columns: number;
  listRows: number;
};

function renderBody(props: BodyProps) {
  const { status, error, mode, items, entries, highlightedItem, highlightedEntry, columns, listRows } = props;
  if (status !== MemoryStatus.Loaded) {
    return <BodyMessage columns={columns} rows={listRows} text={bodyMessage(status, error, mode)} />;
  }
  return mode === MemoryMode.Active ? (
    <MemoryRows columns={columns} items={items} visibleRows={listRows} highlightedId={highlightedItem?.id ?? null} />
  ) : (
    <InboxRows columns={columns} entries={entries} visibleRows={listRows} highlightedId={highlightedEntry?.id ?? null} />
  );
}

function MemoryDetail({
  columns,
  rows,
  offset,
  body
}: {
  columns: number;
  rows: number;
  offset: number;
  body: string;
}) {
  const lines = body.split('\n').map((line) => line.slice(0, columns));
  return (
    <Box flexDirection="column" height={rows}>
      {Array.from({ length: rows }, (_, index) => (
        <Text key={index}>{lines[offset + index] ?? ' '}</Text>
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

function MemoryFooter({
  columns,
  mode,
  detailOpen,
  position
}: {
  columns: number;
  mode: MemoryMode;
  detailOpen: boolean;
  position: string;
}) {
  const theme = useAtomValue(activeThemeAtom);
  // Reserve room for the right-aligned indicator so the (long) hint truncates
  // instead of shrink-wrapping to a second row and over-subscribing the panel.
  const hintWidth = position === '' ? columns : Math.max(0, columns - position.length - 1);

  return (
    <Box width={columns}>
      <Text color={theme.colors.muted} wrap="truncate">
        {footerHint(mode, detailOpen).slice(0, hintWidth)}
      </Text>
      {position === '' ? null : (
        <Box flexGrow={1} justifyContent="flex-end">
          <Text color={theme.colors.muted}>{position}</Text>
        </Box>
      )}
    </Box>
  );
}

/** Standard docked-popup scroll indicator: `more ↓` / `more ↑` / `more ↑↓`. */
function positionIndicator(offset: number, maxOffset: number): string {
  if (maxOffset === 0) {
    return '';
  }
  if (offset <= 0) {
    return 'more ↓';
  }
  if (offset >= maxOffset) {
    return 'more ↑';
  }
  return 'more ↑↓';
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
