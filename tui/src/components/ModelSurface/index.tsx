import { Box, Text } from 'ink';
import { useAtomValue, useSetAtom } from 'jotai';
import { useEffect, useMemo } from 'react';
import { ModelRows } from '@components/ModelSurface/ModelRows.tsx';
import { useModelBackend } from '@components/ModelSurface/useModelBackend.ts';
import { useModelInput } from '@components/ModelSurface/useModelInput.ts';
import { columnsAtom, rowsAtom, safeChromeColumnsAtom } from '@state/ui/index.ts';
import { closeActiveSurfaceAtom } from '@state/ui/surface/index.ts';
import {
  modelHighlightAtom,
  modelRowsAtom,
  modelVisibleRowsAtom,
  modelWindowOffsetAtom,
  visibleModelRowsAtom
} from '@state/ui/model/index.ts';
import { theme } from '@theme/themeConfig.ts';

const HEADER_ROWS = 3;
const FOOTER_ROWS = 1;
const MODEL_FOOTER_HINT = '↑/↓ choose · enter select/retry · esc close';

/** Fullscreen `/model` picker across connected providers. */
export function ModelSurface() {
  const columns = useAtomValue(columnsAtom);
  const safeChromeColumns = useAtomValue(safeChromeColumnsAtom);
  const rows = useAtomValue(rowsAtom);
  const windowOffset = useAtomValue(modelWindowOffsetAtom);
  const allRows = useAtomValue(modelRowsAtom);
  const visibleRows = useAtomValue(visibleModelRowsAtom);
  const highlight = useAtomValue(modelHighlightAtom);
  const setVisibleRows = useSetAtom(modelVisibleRowsAtom);
  const closeActiveSurface = useSetAtom(closeActiveSurfaceAtom);
  const { refreshModels, retryProvider, selectModel } = useModelBackend(closeActiveSurface);
  const bodyRows = useMemo(() => Math.max(1, rows - HEADER_ROWS - FOOTER_ROWS), [rows]);

  useModelInput({ retryProvider, selectModel });

  useEffect(() => {
    setVisibleRows(bodyRows);
  }, [bodyRows, setVisibleRows]);

  useEffect(() => {
    void refreshModels();
  }, [refreshModels]);

  return (
    <Box flexDirection="column" width={columns} height={rows} backgroundColor={theme.colors.bodyBackground}>
      <Text color={theme.colors.accentBlue}>/model</Text>
      <Text color={theme.colors.muted}>Choose the active model for future turns.</Text>
      <Text> </Text>
      <ModelRows columns={safeChromeColumns} highlight={highlight} rows={visibleRows} visibleRows={bodyRows} />
      <ModelFooter columns={safeChromeColumns} offset={windowOffset} total={allRows.length} visible={bodyRows} />
    </Box>
  );
}

function ModelFooter({
  columns,
  offset,
  total,
  visible
}: {
  columns: number;
  offset: number;
  total: number;
  visible: number;
}) {
  const maxOffset = Math.max(0, total - visible);
  const position = maxOffset === 0 ? '' : offset <= 0 ? 'top' : offset >= maxOffset ? 'end' : 'more ↓';
  return (
    <Box width={columns}>
      <Text color={theme.colors.muted}>{MODEL_FOOTER_HINT}</Text>
      {position === '' ? null : (
        <Box flexGrow={1} justifyContent="flex-end">
          <Text color={theme.colors.muted}>{position}</Text>
        </Box>
      )}
    </Box>
  );
}
