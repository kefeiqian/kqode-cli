import { Box, Text } from 'ink';
import { useAtomValue, useSetAtom } from 'jotai';
import { useEffect } from 'react';
import { MaskedInput } from '@components/MaskedInput/index.tsx';
import { ConnectedActions } from '@components/LoginSurface/ConnectedActions.tsx';
import { CustomForm } from '@components/LoginSurface/CustomForm.tsx';
import { OutcomeMessage, RequestErrorMessage } from '@components/LoginSurface/OutcomeMessage.tsx';
import { ProviderList } from '@components/LoginSurface/ProviderList.tsx';
import { useLoginBackend } from '@components/LoginSurface/useLoginBackend.ts';
import { useLoginInput } from '@components/LoginSurface/useLoginInput.ts';
import { workspaceCwdAtom } from '@state/global/index.ts';
import { columnsAtom, rowsAtom } from '@state/ui/index.ts';
import {
  KIMI_BASE_URL,
  LoginStep,
  PROVIDER_ID_CUSTOM,
  backLoginStepAtom,
  clearConfirmAtom,
  connectedActionIndexAtom,
  customBaseUrlAtom,
  customBaseUrlErrorAtom,
  customLabelAtom,
  customLabelErrorAtom,
  loginInFlightAtom,
  loginLastOutcomeAtom,
  loginPersistenceAvailableAtom,
  loginProvidersAtom,
  loginRequestErrorAtom,
  loginSelectedIndexAtom,
  loginStepAtom,
  resetLoginSurfaceAtom,
  selectedProviderAtom
} from '@state/ui/login/index.ts';
import { theme } from '@theme/themeConfig.ts';

/** Fullscreen `/login` provider credential surface. */
export function LoginSurface() {
  const columns = useAtomValue(columnsAtom);
  const rows = useAtomValue(rowsAtom);
  const cwd = useAtomValue(workspaceCwdAtom);
  const providers = useAtomValue(loginProvidersAtom);
  const persistenceAvailable = useAtomValue(loginPersistenceAvailableAtom);
  const selectedIndex = useAtomValue(loginSelectedIndexAtom);
  const selectedProvider = useAtomValue(selectedProviderAtom);
  const step = useAtomValue(loginStepAtom);
  const inFlight = useAtomValue(loginInFlightAtom);
  const outcome = useAtomValue(loginLastOutcomeAtom);
  const requestError = useAtomValue(loginRequestErrorAtom);
  const baseUrl = useAtomValue(customBaseUrlAtom);
  const label = useAtomValue(customLabelAtom);
  const baseUrlError = useAtomValue(customBaseUrlErrorAtom);
  const labelError = useAtomValue(customLabelErrorAtom);
  const actionIndex = useAtomValue(connectedActionIndexAtom);
  const confirmClear = useAtomValue(clearConfirmAtom);
  const resetLogin = useSetAtom(resetLoginSurfaceAtom);
  const backStep = useSetAtom(backLoginStepAtom);
  const { clearProvider, refreshProviders, submitKey } = useLoginBackend(baseUrl, label);

  useLoginInput(clearProvider);

  useEffect(() => {
    resetLogin();
    void refreshProviders();
  }, [refreshProviders, resetLogin]);

  return (
    <Box flexDirection="column" width={columns} height={rows} backgroundColor={theme.colors.bodyBackground}>
      <Text color={theme.colors.accentBlue}>/login</Text>
      <Text color={theme.colors.muted}>Connect a provider. Secrets stay in masked local input only.</Text>
      {!persistenceAvailable ? <PersistenceDegradedMessage providerId={selectedProvider?.providerId ?? null} /> : null}
      <ProviderList cwd={cwd} providers={providers} selectedIndex={selectedIndex} />
      {selectedProvider !== null && step === LoginStep.ConnectedActions ? (
        <ConnectedActions actionIndex={actionIndex} confirmClear={confirmClear} provider={selectedProvider} />
      ) : null}
      {selectedProvider?.providerId === PROVIDER_ID_CUSTOM && step !== LoginStep.List && step !== LoginStep.ConnectedActions ? (
        <CustomForm baseUrl={baseUrl} baseUrlError={baseUrlError} label={label} labelError={labelError} step={step} />
      ) : null}
      {selectedProvider !== null && selectedProvider.providerId !== PROVIDER_ID_CUSTOM && step === LoginStep.Key ? (
        <Text color={theme.colors.muted}>Kimi base URL: {KIMI_BASE_URL}</Text>
      ) : null}
      {step === LoginStep.Key ? (
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

function PersistenceDegradedMessage({ providerId }: { providerId: string | null }) {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={theme.colors.warning} paddingX={1}>
      <Text color={theme.colors.warning}>
        Settings won&apos;t persist (storage unavailable); set `CUSTOM_API_KEY` in `.env` to persist across restarts.
      </Text>
      {providerId === PROVIDER_ID_CUSTOM ? (
        <Text color={theme.colors.warning}>Custom can&apos;t be saved in this mode because its base URL needs storage.</Text>
      ) : null}
    </Box>
  );
}
