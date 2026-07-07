import { Box, Text, useInput } from 'ink';
import { useAtomValue, useSetAtom } from 'jotai';
import { useMemo } from 'react';
import { buildHelpSections, flattenHelpLines } from '@components/HelpScreen/helpContent.ts';
import type { HelpLine } from '@components/HelpScreen/helpContent.ts';
import { clamp } from '@libs/math/clamp.ts';
import { columnsAtom, rowsAtom, safeChromeColumnsAtom } from '@state/ui/index.ts';
import {
  closeHelpAtom,
  helpScrollOffsetAtom,
  scrollHelpByRowsAtom
} from '@state/ui/help/index.ts';
import { theme } from '@theme/themeConfig.ts';

/** Bottom hint shown in the pager, mirroring `less`/`more` affordances. */
const HELP_FOOTER_HINT = '↑/↓ scroll · q/esc close';

/**
 * Fullscreen `/help` viewer. Rendered in place of the home screen (see `App`),
 * it pages through the command + keybinding reference: `↑/↓` and `page up/down`
 * scroll, `q`/`esc` returns to the transcript. The content area fills every row
 * above a fixed footer, so the layout stays pinned like the rest of the TUI.
 */
export function HelpScreen() {
  const columns = useAtomValue(columnsAtom);
  const safeChromeColumns = useAtomValue(safeChromeColumnsAtom);
  const rows = useAtomValue(rowsAtom);
  const scrollOffset = useAtomValue(helpScrollOffsetAtom);
  const closeHelp = useSetAtom(closeHelpAtom);
  const scrollBy = useSetAtom(scrollHelpByRowsAtom);

  const lines = useMemo(() => flattenHelpLines(buildHelpSections()), []);
  const visibleRows = Math.max(1, rows - 1);
  const maxOffset = Math.max(0, lines.length - visibleRows);
  const offset = clamp(scrollOffset, 0, maxOffset);
  const pageRows = Math.max(1, visibleRows - 1);

  useInput((input, key) => {
    if (key.escape || input === 'q') {
      closeHelp();
      return;
    }
    if (key.upArrow) {
      scrollBy({ delta: -1, maxOffset });
      return;
    }
    if (key.downArrow) {
      scrollBy({ delta: 1, maxOffset });
      return;
    }
    if (key.pageUp) {
      scrollBy({ delta: -pageRows, maxOffset });
      return;
    }
    if (key.pageDown) {
      scrollBy({ delta: pageRows, maxOffset });
    }
  });

  const visible = lines.slice(offset, offset + visibleRows);

  return (
    <Box
      flexDirection="column"
      width={columns}
      height={rows}
      backgroundColor={theme.colors.bodyBackground}
    >
      <Box flexDirection="column" height={visibleRows}>
        {Array.from({ length: visibleRows }, (_, index) => (
          <HelpRow key={index} line={visible[index]} />
        ))}
      </Box>
      <HelpFooter columns={safeChromeColumns} offset={offset} maxOffset={maxOffset} />
    </Box>
  );
}

function HelpRow({ line }: { line: HelpLine | undefined }) {
  if (line === undefined || line.kind === 'blank') {
    return <Text> </Text>;
  }

  const color = line.kind === 'title' ? theme.colors.accentBlue : theme.colors.foreground;
  return (
    <Text color={color} wrap="truncate">
      {line.text}
    </Text>
  );
}

function HelpFooter({
  columns,
  offset,
  maxOffset
}: {
  columns: number;
  offset: number;
  maxOffset: number;
}) {
  const position = scrollPositionLabel(offset, maxOffset);

  return (
    <Box width={columns}>
      <Text color={theme.colors.muted}>{HELP_FOOTER_HINT}</Text>
      {position !== '' ? (
        <Box flexGrow={1} justifyContent="flex-end">
          <Text color={theme.colors.muted}>{position}</Text>
        </Box>
      ) : null}
    </Box>
  );
}

/** Right-aligned pager position: empty when everything fits on one screen. */
function scrollPositionLabel(offset: number, maxOffset: number): string {
  if (maxOffset === 0) {
    return '';
  }
  if (offset <= 0) {
    return 'top';
  }
  if (offset >= maxOffset) {
    return 'end';
  }
  return 'more ↓';
}
