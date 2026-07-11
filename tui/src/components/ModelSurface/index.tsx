import { Box, Text } from 'ink';
import { useAtomValue, useSetAtom } from 'jotai';
import { useEffect } from 'react';
import { CommandSurface } from '@components/CommandSurface/index.tsx';
import { useCommandSurfaceLayout } from '@components/CommandSurface/useCommandSurfaceLayout.ts';
import { MaskedInput } from '@components/MaskedInput/index.tsx';
import { OutcomeMessage, RequestErrorMessage } from '@components/ConnectSurface/OutcomeMessage.tsx';
import { ModelRows } from '@components/ModelSurface/ModelRows.tsx';
import { useInlineConnect } from '@components/ModelSurface/useInlineConnect.ts';
import { useModelBackend } from '@components/ModelSurface/useModelBackend.ts';
import { useModelInput } from '@components/ModelSurface/useModelInput.ts';
import { windowProviderModelRows } from '@libs/providers/index.ts';
import type { ProviderModelRow } from '@libs/providers/index.ts';
import { positionIndicator } from '@libs/tui/layout.ts';
import { dockedPanelRowsAtom, safeChromeColumnsAtom } from '@state/ui/index.ts';
import { closeActiveSurfaceAtom, openConnectSurfaceAtom } from '@state/ui/surface/index.ts';
import { PROVIDER_ID_CUSTOM } from '@state/ui/connect/index.ts';
import {
  MODEL_DOCK_CHROME_ROWS,
  modelHighlightAtom,
  inlineConnectInFlightAtom,
  inlineConnectOutcomeAtom,
  inlineConnectProviderIdAtom,
  inlineConnectRequestErrorAtom,
  modelRowsAtom,
  modelVisibleRowsAtom,
  modelWindowOffsetAtom,
  scrollModelHighlightIntoViewAtom
} from '@state/ui/model/index.ts';
import type { ModelSurfaceRow } from '@state/ui/model/index.ts';
import { activeThemeAtom } from '@state/global/index.ts';

const MODEL_FOOTER_HINT = '↑/↓ choose · enter select/connect · esc close';

/** Bottom-docked `/model` picker across connected providers. */
export function ModelSurface() {
  const safeChromeColumns = useAtomValue(safeChromeColumnsAtom);
  const panelRows = useAtomValue(dockedPanelRowsAtom);
  const windowOffset = useAtomValue(modelWindowOffsetAtom);
  const allRows = useAtomValue(modelRowsAtom);
  const highlight = useAtomValue(modelHighlightAtom);
  const inlineProviderId = useAtomValue(inlineConnectProviderIdAtom);
  const inlineInFlight = useAtomValue(inlineConnectInFlightAtom);
  const inlineOutcome = useAtomValue(inlineConnectOutcomeAtom);
  const inlineRequestError = useAtomValue(inlineConnectRequestErrorAtom);
  const theme = useAtomValue(activeThemeAtom);
  const setVisibleRows = useSetAtom(modelVisibleRowsAtom);
  const scrollHighlightIntoView = useSetAtom(scrollModelHighlightIntoViewAtom);
  const closeActiveSurface = useSetAtom(closeActiveSurfaceAtom);
  const openConnect = useSetAtom(openConnectSurfaceAtom);
  const { refreshModels, retryProvider, selectModel } = useModelBackend(closeActiveSurface);
  const { cancelInlineConnect, startInlineConnect, submitInlineKey } = useInlineConnect(refreshModels);
  const layout = useCommandSurfaceLayout({ panelRows, chromeWithGap: MODEL_DOCK_CHROME_ROWS });
  const listRows = layout.bodyRows;
  // Window the list at render time from `listRows` (derived from the docked cap)
  // rather than the effect-set `modelVisibleRowsAtom`, which lags one render
  // behind the async list load and would otherwise flash a mis-windowed frame.
  const clampedOffset = Math.min(windowOffset, Math.max(0, allRows.length - listRows));
  const visibleRows = windowProviderModelRows(
    allRows as ProviderModelRow[],
    clampedOffset,
    listRows
  ) as ModelSurfaceRow[];

  useModelInput({
    cancelInlineConnect,
    openCustomConnect: () => openConnect({ providerId: PROVIDER_ID_CUSTOM, returnToModel: true }),
    retryProvider,
    selectModel,
    startInlineConnect
  });

  useEffect(() => {
    setVisibleRows(listRows);
    scrollHighlightIntoView();
  }, [listRows, setVisibleRows, scrollHighlightIntoView]);

  useEffect(() => {
    void refreshModels();
  }, [refreshModels]);

  return (
    <CommandSurface
      panelRows={panelRows}
      layout={layout}
      label="/model"
      bodyRows={listRows}
      footerHint={MODEL_FOOTER_HINT}
      position={positionIndicator(clampedOffset, Math.max(0, allRows.length - listRows))}
    >
      {inlineProviderId === null ? (
        <ModelRows highlight={highlight} rows={visibleRows} visibleRows={listRows} />
      ) : (
        <Box flexDirection="column" height={listRows} width={safeChromeColumns}>
          <Box width={safeChromeColumns}>
            <Text color={theme.colors.accentBlue}>API key: </Text>
            <MaskedInput isActive={!inlineInFlight} onCancel={cancelInlineConnect} onSubmit={submitInlineKey} />
          </Box>
          {inlineInFlight ? <Text color={theme.colors.warning}>Working…</Text> : null}
          <OutcomeMessage outcome={inlineOutcome} providerId={inlineProviderId} />
          <RequestErrorMessage message={inlineRequestError} />
        </Box>
      )}
    </CommandSurface>
  );
}
