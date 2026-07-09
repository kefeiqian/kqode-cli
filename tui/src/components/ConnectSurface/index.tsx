import { Box, Text } from 'ink';
import { useAtomValue, useSetAtom } from 'jotai';
import { useEffect } from 'react';
import { MaskedInput } from '@components/MaskedInput/index.tsx';
import { ConnectedActions } from '@components/ConnectSurface/ConnectedActions.tsx';
import { CustomForm } from '@components/ConnectSurface/CustomForm.tsx';
import { OutcomeMessage, RequestErrorMessage } from '@components/ConnectSurface/OutcomeMessage.tsx';
import { ProviderList } from '@components/ConnectSurface/ProviderList.tsx';
import { useConnectBackend } from '@components/ConnectSurface/useConnectBackend.ts';
import { useConnectInput } from '@components/ConnectSurface/useConnectInput.ts';
import { activeThemeAtom } from '@state/global/index.ts';
import { columnsAtom, rowsAtom } from '@state/ui/index.ts';
import {
  KIMI_BASE_URL,
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
  selectedProviderAtom
} from '@state/ui/connect/index.ts';

/** Fullscreen `/connect` provider credential surface. */
export function ConnectSurface() {
  const columns = useAtomValue(columnsAtom);
  const rows = useAtomValue(rowsAtom);
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

  useConnectInput(clearProvider);

  useEffect(() => {
    resetConnect();
    void refreshProviders();
  }, [refreshProviders, resetConnect]);

  return (
    <Box flexDirection="column" width={columns} height={rows} backgroundColor={theme.colors.bodyBackground}>
      <Text color={theme.colors.accentBlue}>/connect</Text>
      <Text color={theme.colors.muted}>Connect a provider. Secrets stay in masked local input only.</Text>
      <ProviderList providers={providers} selectedIndex={selectedIndex} />
      {selectedProvider !== null && step === ConnectStep.ConnectedActions ? (
        <ConnectedActions actionIndex={actionIndex} confirmClear={confirmClear} provider={selectedProvider} />
      ) : null}
      {selectedProvider?.providerId === PROVIDER_ID_CUSTOM && step !== ConnectStep.List && step !== ConnectStep.ConnectedActions ? (
        <CustomForm baseUrl={baseUrl} baseUrlError={baseUrlError} label={label} labelError={labelError} step={step} />
      ) : null}
      {selectedProvider !== null && selectedProvider.providerId !== PROVIDER_ID_CUSTOM && step === ConnectStep.Key ? (
        <Text color={theme.colors.muted}>Kimi base URL: {KIMI_BASE_URL}</Text>
      ) : null}
      {step === ConnectStep.Key ? (
        <Box>
          <Text color={theme.colors.accentBlue}>API key: </Text>
          <MaskedInput isActive={!inFlight} onCancel={backStep} onSubmit={submitKey} />
        </Box>
      ) : null}
      {inFlight ? <Text color={theme.colors.warning}>Working…</Text> : null}
      <OutcomeMessage outcome={outcome?.outcome ?? null} providerId={outcome?.providerId ?? null} />
      <RequestErrorMessage message={requestError} />
    </Box>
  );
}
