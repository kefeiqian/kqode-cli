import { useInput } from 'ink';
import { useAtomValue, useSetAtom } from 'jotai';
import { useRef } from 'react';
import { isMouseInput } from '@libs/terminal/mouse.ts';
import { validateBaseUrl, validateLabel } from '@libs/providers/index.ts';
import { editField, isReturn, isShiftTab } from '@components/ConnectSurface/keyInput.ts';
import {
  ConnectStep,
  PROVIDER_ID_CUSTOM,
  backConnectStepAtom,
  chooseSelectedProviderAtom,
  clearConfirmAtom,
  connectedActionIndexAtom,
  connectReturnToModelAtom,
  customBaseUrlAtom,
  customBaseUrlCursorAtom,
  customBaseUrlErrorAtom,
  customLabelAtom,
  customLabelCursorAtom,
  customLabelErrorAtom,
  connectInFlightAtom,
  connectStepAtom,
  moveConnectSelectionAtom,
  selectedProviderAtom
} from '@state/ui/connect/index.ts';
import { closeActiveSurfaceAtom } from '@state/ui/index.ts';
import { openModelSurfaceAtom } from '@state/ui/surface/index.ts';
import {
  CONNECTED_ACTION_CLEAR_INDEX,
  CONNECTED_ACTION_REPLACE_INDEX
} from '@components/ConnectSurface/ConnectedActions.tsx';

/** Wires `/connect` keybindings while `MaskedInput` owns secret text entry. */
export function useConnectInput(clearProvider: () => Promise<void>) {
  const step = useAtomValue(connectStepAtom);
  const inFlight = useAtomValue(connectInFlightAtom);
  const selectedProvider = useAtomValue(selectedProviderAtom);
  const baseUrl = useAtomValue(customBaseUrlAtom);
  const label = useAtomValue(customLabelAtom);
  const baseUrlCursor = useAtomValue(customBaseUrlCursorAtom);
  const labelCursor = useAtomValue(customLabelCursorAtom);
  const actionIndex = useAtomValue(connectedActionIndexAtom);
  const confirmClear = useAtomValue(clearConfirmAtom);
  const returnToModel = useAtomValue(connectReturnToModelAtom);
  const stepRef = useLatest(step);
  const inFlightRef = useLatest(inFlight);
  const selectedProviderRef = useLatest(selectedProvider);
  const baseUrlRef = useLatest(baseUrl);
  const labelRef = useLatest(label);
  const baseUrlCursorRef = useLatest(baseUrlCursor);
  const labelCursorRef = useLatest(labelCursor);
  const actionIndexRef = useLatest(actionIndex);
  const confirmClearRef = useLatest(confirmClear);
  const returnToModelRef = useLatest(returnToModel);

  const setStep = useSetAtom(connectStepAtom);
  const setBaseUrl = useSetAtom(customBaseUrlAtom);
  const setLabel = useSetAtom(customLabelAtom);
  const setBaseUrlCursor = useSetAtom(customBaseUrlCursorAtom);
  const setLabelCursor = useSetAtom(customLabelCursorAtom);
  const setBaseUrlError = useSetAtom(customBaseUrlErrorAtom);
  const setLabelError = useSetAtom(customLabelErrorAtom);
  const setActionIndex = useSetAtom(connectedActionIndexAtom);
  const setConfirmClear = useSetAtom(clearConfirmAtom);
  const moveSelection = useSetAtom(moveConnectSelectionAtom);
  const chooseSelectedProvider = useSetAtom(chooseSelectedProviderAtom);
  const backStep = useSetAtom(backConnectStepAtom);
  const closeActiveSurface = useSetAtom(closeActiveSurfaceAtom);
  const openModel = useSetAtom(openModelSurfaceAtom);

  useInput((input, key) => {
    const currentStep = stepRef.current;
    if (inFlightRef.current || isMouseInput(input)) {
      return;
    }
    if (key.escape && returnToModelRef.current) {
      openModel();
      return;
    }
    if (currentStep === ConnectStep.Key) {
      if (selectedProviderRef.current?.providerId === PROVIDER_ID_CUSTOM && (key.upArrow || key.downArrow)) {
        setStep(ConnectStep.CustomLabel);
      }
      return;
    }
    if (currentStep === ConnectStep.List) {
      handleListInput(input, key);
    } else if (currentStep === ConnectStep.ConnectedActions) {
      void handleConnectedInput(input, key);
    } else if (currentStep === ConnectStep.CustomUrl || currentStep === ConnectStep.CustomLabel) {
      handleCustomInput(input, key);
    }
  });

  function handleListInput(input: string, key: Parameters<Parameters<typeof useInput>[0]>[1]) {
    if (key.escape) {
      closeActiveSurface();
    } else if (key.upArrow) {
      moveSelection(-1);
    } else if (key.downArrow) {
      moveSelection(1);
    } else if (isReturn(input, key)) {
      chooseSelectedProvider();
    }
  }

  async function handleConnectedInput(input: string, key: Parameters<Parameters<typeof useInput>[0]>[1]) {
    if (confirmClearRef.current) {
      if (input.toLowerCase() === 'y') {
        await clearProvider();
        setConfirmClear(false);
      } else if (input.toLowerCase() === 'n' || key.escape) {
        setConfirmClear(false);
      }
      return;
    }

    if (key.escape) {
      backStep();
    } else if (key.upArrow || key.downArrow) {
      setActionIndex(
        actionIndexRef.current === CONNECTED_ACTION_REPLACE_INDEX
          ? CONNECTED_ACTION_CLEAR_INDEX
          : CONNECTED_ACTION_REPLACE_INDEX
      );
    } else if (input.toLowerCase() === 'r') {
      setStep(selectedProviderRef.current?.providerId === PROVIDER_ID_CUSTOM ? ConnectStep.CustomUrl : ConnectStep.Key);
    } else if (input.toLowerCase() === 'c') {
      setConfirmClear(true);
    } else if (isReturn(input, key) && actionIndexRef.current === CONNECTED_ACTION_REPLACE_INDEX) {
      setStep(selectedProviderRef.current?.providerId === PROVIDER_ID_CUSTOM ? ConnectStep.CustomUrl : ConnectStep.Key);
    } else if (isReturn(input, key)) {
      setConfirmClear(true);
    }
  }

  function handleCustomInput(input: string, key: Parameters<Parameters<typeof useInput>[0]>[1]) {
    if (key.escape || isShiftTab(input, key) || key.upArrow) {
      backStep();
      return;
    }
    if (stepRef.current === ConnectStep.CustomUrl) {
      handleUrlInput(input, key);
    } else {
      handleLabelInput(input, key);
    }
  }

  function handleUrlInput(input: string, key: Parameters<Parameters<typeof useInput>[0]>[1]) {
    if (isReturn(input, key) || key.downArrow) {
      const result = validateBaseUrl(baseUrlRef.current);
      setBaseUrlError(result.ok ? null : result.message);
      if (result.ok) {
        setStep(ConnectStep.CustomLabel);
      }
      return;
    }
    setBaseUrlError(null);
    editField(
      input,
      key,
      { value: baseUrlRef.current, cursorIndex: baseUrlCursorRef.current },
      setBaseUrl,
      setBaseUrlCursor
    );
  }

  function handleLabelInput(input: string, key: Parameters<Parameters<typeof useInput>[0]>[1]) {
    if (isReturn(input, key) || key.downArrow) {
      const result = validateLabel(labelRef.current);
      setLabelError(result.ok ? null : result.message);
      if (result.ok) {
        setStep(ConnectStep.Key);
      }
      return;
    }
    setLabelError(null);
    editField(
      input,
      key,
      { value: labelRef.current, cursorIndex: labelCursorRef.current },
      setLabel,
      setLabelCursor
    );
  }
}

function useLatest<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}
