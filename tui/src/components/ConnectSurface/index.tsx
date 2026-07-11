import { Box, Text } from 'ink';
import { useAtomValue, useSetAtom } from 'jotai';
import { useEffect } from 'react';
import { CommandSurface } from '@components/CommandSurface/index.tsx';
import { useCommandSurfaceLayout } from '@components/CommandSurface/useCommandSurfaceLayout.ts';
import { MaskedInput } from '@components/MaskedInput/index.tsx';
import { ConnectedActions } from '@components/ConnectSurface/ConnectedActions.tsx';
import { CustomForm, destinationHost } from '@components/ConnectSurface/CustomForm.tsx';
import { OutcomeMessage, RequestErrorMessage } from '@components/ConnectSurface/OutcomeMessage.tsx';
import { ProviderList } from '@components/ConnectSurface/ProviderList.tsx';
import { useConnectBackend } from '@components/ConnectSurface/useConnectBackend.ts';
import { useConnectInput } from '@components/ConnectSurface/useConnectInput.ts';
import { activeThemeAtom } from '@state/global/index.ts';
import { dockedPanelRowsAtom } from '@state/ui/index.ts';
import {
  KIMI_BASE_URL,
  CONNECT_SHELL_CHROME_ROWS,
  ConnectStep,
  PROVIDER_ID_CUSTOM,
  backConnectStepAtom,
  clearConfirmAtom,
  connectedActionIndexAtom,
  customBaseUrlAtom,
  customBaseUrlErrorAtom,
  customLabelAtom,
  customLabelErrorAtom,
  connectInFlightAtom,
  connectLastOutcomeAtom,
  connectProvidersAtom,
  connectRequestErrorAtom,
  connectSelectedIndexAtom,
  connectStepAtom,
  resetConnectSurfaceAtom,
  selectedProviderAtom,
  type ConnectOutcome
} from '@state/ui/connect/index.ts';

const CONNECT_LIST_HINT = '↑/↓ choose · enter select · esc close';
const CONNECT_KEY_HINT = 'Enter submits · Esc back';
const CONNECT_FIELD_HINT = 'Enter/↓ next · ↑/Shift+Tab back · ←/→ edit · Esc back';
const CONNECT_ACTIONS_HINT = 'Enter chooses · ↑/↓ moves · Esc back';
const CONNECT_CONFIRM_HINT = 'y confirm · n/Esc cancel';

/** Bottom-docked `/connect` provider credential surface. */
export function ConnectSurface() {
  const panelRows = useAtomValue(dockedPanelRowsAtom);
  const providers = useAtomValue(connectProvidersAtom);
  const selectedIndex = useAtomValue(connectSelectedIndexAtom);
  const selectedProvider = useAtomValue(selectedProviderAtom);
  const step = useAtomValue(connectStepAtom);
  const inFlight = useAtomValue(connectInFlightAtom);
  const outcome = useAtomValue(connectLastOutcomeAtom);
  const requestError = useAtomValue(connectRequestErrorAtom);
  const baseUrl = useAtomValue(customBaseUrlAtom);
  const label = useAtomValue(customLabelAtom);
  const baseUrlError = useAtomValue(customBaseUrlErrorAtom);
  const labelError = useAtomValue(customLabelErrorAtom);
  const actionIndex = useAtomValue(connectedActionIndexAtom);
  const confirmClear = useAtomValue(clearConfirmAtom);
  const theme = useAtomValue(activeThemeAtom);
  const resetConnect = useSetAtom(resetConnectSurfaceAtom);
  const backStep = useSetAtom(backConnectStepAtom);
  const { clearProvider, refreshProviders, submitKey } = useConnectBackend(baseUrl, label);

  const layout = useCommandSurfaceLayout({ panelRows, chromeWithGap: CONNECT_SHELL_CHROME_ROWS });

  useConnectInput(clearProvider);

  useEffect(() => {
    resetConnect();
    void refreshProviders();
  }, [refreshProviders, resetConnect]);

  // The provider list shows only on the List step; during a credential step it is
  // hidden and the step form is the whole body, so the input is never squeezed by
  // the list at the capped height. The active provider stays identified through
  // the dynamic label rather than the hidden list.
  const onList = step === ConnectStep.List;
  const isCustom = selectedProvider?.providerId === PROVIDER_ID_CUSTOM;
  const connectLabel =
    onList || selectedProvider === null ? '/connect' : `/connect · ${selectedProvider.label}`;

  return (
    <CommandSurface
      panelRows={panelRows}
      layout={layout}
      label={connectLabel}
      bodyRows={layout.bodyRows}
      footerHint={connectFooterHint(step, confirmClear)}
      position=""
    >
      {onList ? <ProviderList providers={providers} selectedIndex={selectedIndex} /> : null}
      {step === ConnectStep.ConnectedActions && selectedProvider !== null ? (
        <ConnectedActions actionIndex={actionIndex} confirmClear={confirmClear} provider={selectedProvider} />
      ) : null}
      {isCustom && (step === ConnectStep.CustomUrl || step === ConnectStep.CustomLabel) ? (
        <CustomForm baseUrl={baseUrl} baseUrlError={baseUrlError} label={label} labelError={labelError} step={step} />
      ) : null}
      {step === ConnectStep.Key ? (
        <>
          <Text color={theme.colors.muted} wrap="truncate">
            {isCustom ? `Destination host: ${destinationHost(baseUrl)}` : `Kimi base URL: ${KIMI_BASE_URL}`}
          </Text>
          <Box>
            <Text color={theme.colors.accentBlue}>API key: </Text>
            <MaskedInput isActive={!inFlight} onCancel={backStep} onSubmit={submitKey} />
          </Box>
        </>
      ) : null}
      <ConnectFeedback inFlight={inFlight} outcome={outcome} requestError={requestError} />
    </CommandSurface>
  );
}

/** At-most-one feedback line for the step body: in-flight, else request error, else set-key outcome. */
function ConnectFeedback({
  inFlight,
  outcome,
  requestError
}: {
  inFlight: boolean;
  outcome: ConnectOutcome | null;
  requestError: string | null;
}) {
  const theme = useAtomValue(activeThemeAtom);

  if (inFlight) {
    return <Text color={theme.colors.warning}>Working…</Text>;
  }
  if (requestError !== null) {
    return <RequestErrorMessage message={requestError} />;
  }
  return <OutcomeMessage outcome={outcome?.outcome ?? null} providerId={outcome?.providerId ?? null} />;
}

/** Step-dependent bottom-pinned footer hint, moved out of the inline step content. */
function connectFooterHint(step: ConnectStep, confirmClear: boolean): string {
  switch (step) {
    case ConnectStep.List:
      return CONNECT_LIST_HINT;
    case ConnectStep.Key:
      return CONNECT_KEY_HINT;
    case ConnectStep.CustomUrl:
    case ConnectStep.CustomLabel:
      return CONNECT_FIELD_HINT;
    case ConnectStep.ConnectedActions:
      return confirmClear ? CONNECT_CONFIRM_HINT : CONNECT_ACTIONS_HINT;
    default:
      return '';
  }
}
