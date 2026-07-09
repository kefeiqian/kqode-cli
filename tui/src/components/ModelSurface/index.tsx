import { Box, Text } from 'ink';
import { useAtomValue, useSetAtom } from 'jotai';
import { useEffect, useMemo } from 'react';
import { MaskedInput } from '@components/MaskedInput/index.tsx';
import { OutcomeMessage, RequestErrorMessage } from '@components/ConnectSurface/OutcomeMessage.tsx';
import { ModelRows } from '@components/ModelSurface/ModelRows.tsx';
import { useInlineConnect } from '@components/ModelSurface/useInlineConnect.ts';
import { useModelBackend } from '@components/ModelSurface/useModelBackend.ts';
import { useModelInput } from '@components/ModelSurface/useModelInput.ts';
import { columnsAtom, rowsAtom, safeChromeColumnsAtom } from '@state/ui/index.ts';
import { closeActiveSurfaceAtom, openConnectSurfaceAtom } from '@state/ui/surface/index.ts';
import { PROVIDER_ID_CUSTOM } from '@state/ui/connect/index.ts';
import {
  modelHighlightAtom,
  inlineConnectInFlightAtom,
  inlineConnectOutcomeAtom,
  inlineConnectProviderIdAtom,
  inlineConnectRequestErrorAtom,
  modelRowsAtom,
  modelVisibleRowsAtom,
  modelWindowOffsetAtom,
  visibleModelRowsAtom
} from '@state/ui/model/index.ts';
import { activeThemeAtom } from '@state/global/index.ts';

const HEADER_ROWS = 3;
const FOOTER_ROWS = 1;
const INLINE_CONNECT_ROWS = 3;
const MODEL_FOOTER_HINT = '↑/↓ choose · enter select/connect · esc close';

/** Fullscreen `/model` picker across connected providers. */
export function ModelSurface() {
  const columns = useAtomValue(columnsAtom);
  const safeChromeColumns = useAtomValue(safeChromeColumnsAtom);
  const rows = useAtomValue(rowsAtom);
  const windowOffset = useAtomValue(modelWindowOffsetAtom);
  const allRows = useAtomValue(modelRowsAtom);
  const visibleRows = useAtomValue(visibleModelRowsAtom);
  const highlight = useAtomValue(modelHighlightAtom);
  const inlineProviderId = useAtomValue(inlineConnectProviderIdAtom);
  const inlineInFlight = useAtomValue(inlineConnectInFlightAtom);
  const inlineOutcome = useAtomValue(inlineConnectOutcomeAtom);
  const inlineRequestError = useAtomValue(inlineConnectRequestErrorAtom);
  const theme = useAtomValue(activeThemeAtom);
  const setVisibleRows = useSetAtom(modelVisibleRowsAtom);
  const closeActiveSurface = useSetAtom(closeActiveSurfaceAtom);
  const openConnect = useSetAtom(openConnectSurfaceAtom);
  const { refreshModels, retryProvider, selectModel } = useModelBackend(closeActiveSurface);
  const { cancelInlineConnect, startInlineConnect, submitInlineKey } = useInlineConnect(refreshModels);
  const inlineRows = inlineProviderId === null ? 0 : INLINE_CONNECT_ROWS;
  const bodyRows = useMemo(() => Math.max(1, rows - HEADER_ROWS - FOOTER_ROWS - inlineRows), [inlineRows, rows]);

  useModelInput({
    cancelInlineConnect,
    openCustomConnect: () => openConnect({ providerId: PROVIDER_ID_CUSTOM, returnToModel: true }),
    retryProvider,
    selectModel,
    startInlineConnect
  });

  useEffect(() => {
    setVisibleRows(bodyRows);
  }, [bodyRows, setVisibleRows]);

  useEffect(() => {
    void refreshModels();
  }, [refreshModels]);

  return (
    <Box flexDirection="column" width={columns} height={rows} backgroundColor={theme.colors.bodyBackground}>
      <Text color={theme.colors.accentBlue}>/model</Text>
      <Text color={theme.colors.muted}>Choose a model or connect a provider.</Text>
      <Text> </Text>
      <ModelRows columns={safeChromeColumns} highlight={highlight} rows={visibleRows} visibleRows={bodyRows} />
      {inlineProviderId === null ? null : (
        <Box flexDirection="column" width={safeChromeColumns}>
          <Box width={safeChromeColumns}>
            <Text color={theme.colors.accentBlue}>API key: </Text>
            <MaskedInput isActive={!inlineInFlight} onCancel={cancelInlineConnect} onSubmit={submitInlineKey} />
          </Box>
          {inlineInFlight ? <Text color={theme.colors.warning}>Working…</Text> : null}
          <OutcomeMessage outcome={inlineOutcome} providerId={inlineProviderId} />
          <RequestErrorMessage message={inlineRequestError} />
        </Box>
      )}
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
  const theme = useAtomValue(activeThemeAtom);
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
