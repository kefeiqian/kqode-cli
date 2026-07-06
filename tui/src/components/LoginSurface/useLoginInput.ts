import { useInput } from 'ink';
import { useAtomValue, useSetAtom } from 'jotai';
import { useRef } from 'react';
import { printableInput } from '@libs/composer/promptText.ts';
import { isMouseInput } from '@libs/terminal/mouse.ts';
import { validateBaseUrl, validateLabel } from '@libs/providers/index.ts';
import {
  LoginStep,
  PROVIDER_ID_CUSTOM,
  backLoginStepAtom,
  chooseSelectedProviderAtom,
  clearConfirmAtom,
  connectedActionIndexAtom,
  customBaseUrlAtom,
  customBaseUrlErrorAtom,
  customLabelAtom,
  customLabelErrorAtom,
  loginInFlightAtom,
  loginStepAtom,
  moveLoginSelectionAtom,
  selectedProviderAtom
} from '@state/ui/login/index.ts';
import { closeActiveSurfaceAtom } from '@state/ui/index.ts';
import {
  CONNECTED_ACTION_CLEAR_INDEX,
  CONNECTED_ACTION_REPLACE_INDEX
} from '@components/LoginSurface/ConnectedActions.tsx';

const SHIFT_TAB_INPUT = '\u001B[Z';

/** Wires `/login` keybindings while `MaskedInput` owns secret text entry. */
export function useLoginInput(clearProvider: () => Promise<void>) {
  const step = useAtomValue(loginStepAtom);
  const inFlight = useAtomValue(loginInFlightAtom);
  const selectedProvider = useAtomValue(selectedProviderAtom);
  const baseUrl = useAtomValue(customBaseUrlAtom);
  const label = useAtomValue(customLabelAtom);
  const actionIndex = useAtomValue(connectedActionIndexAtom);
  const confirmClear = useAtomValue(clearConfirmAtom);
  const stepRef = useLatest(step);
  const inFlightRef = useLatest(inFlight);
  const selectedProviderRef = useLatest(selectedProvider);
  const baseUrlRef = useLatest(baseUrl);
  const labelRef = useLatest(label);
  const actionIndexRef = useLatest(actionIndex);
  const confirmClearRef = useLatest(confirmClear);

  const setStep = useSetAtom(loginStepAtom);
  const setBaseUrl = useSetAtom(customBaseUrlAtom);
  const setLabel = useSetAtom(customLabelAtom);
  const setBaseUrlError = useSetAtom(customBaseUrlErrorAtom);
  const setLabelError = useSetAtom(customLabelErrorAtom);
  const setActionIndex = useSetAtom(connectedActionIndexAtom);
  const setConfirmClear = useSetAtom(clearConfirmAtom);
  const moveSelection = useSetAtom(moveLoginSelectionAtom);
  const chooseSelectedProvider = useSetAtom(chooseSelectedProviderAtom);
  const backStep = useSetAtom(backLoginStepAtom);
  const closeActiveSurface = useSetAtom(closeActiveSurfaceAtom);

  useInput((input, key) => {
    const currentStep = stepRef.current;
    if (inFlightRef.current || isMouseInput(input)) {
      return;
    }
    if (currentStep === LoginStep.Key) {
      if (selectedProviderRef.current?.providerId === PROVIDER_ID_CUSTOM && (key.upArrow || key.downArrow)) {
        setStep(LoginStep.CustomLabel);
      }
      return;
    }
    if (currentStep === LoginStep.List) {
      handleListInput(input, key);
    } else if (currentStep === LoginStep.ConnectedActions) {
      void handleConnectedInput(input, key);
    } else if (currentStep === LoginStep.CustomUrl || currentStep === LoginStep.CustomLabel) {
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
      setStep(selectedProviderRef.current?.providerId === PROVIDER_ID_CUSTOM ? LoginStep.CustomUrl : LoginStep.Key);
    } else if (input.toLowerCase() === 'c') {
      setConfirmClear(true);
    } else if (isReturn(input, key) && actionIndexRef.current === CONNECTED_ACTION_REPLACE_INDEX) {
      setStep(selectedProviderRef.current?.providerId === PROVIDER_ID_CUSTOM ? LoginStep.CustomUrl : LoginStep.Key);
    } else if (isReturn(input, key)) {
      setConfirmClear(true);
    }
  }

  function handleCustomInput(input: string, key: Parameters<Parameters<typeof useInput>[0]>[1]) {
    if (key.escape || isShiftTab(input, key) || key.upArrow) {
      backStep();
      return;
    }
    if (stepRef.current === LoginStep.CustomUrl) {
      handleUrlInput(input, key);
    } else {
      handleLabelInput(input, key);
    }
  }

  function handleUrlInput(input: string, key: Parameters<Parameters<typeof useInput>[0]>[1]) {
    if (isReturn(input, key)) {
      const result = validateBaseUrl(baseUrlRef.current);
      setBaseUrlError(result.ok ? null : result.message);
      if (result.ok) {
        setStep(LoginStep.CustomLabel);
      }
      return;
    }
    setBaseUrlError(null);
    editText(input, key, baseUrlRef.current, setBaseUrl);
  }

  function handleLabelInput(input: string, key: Parameters<Parameters<typeof useInput>[0]>[1]) {
    if (isReturn(input, key) || key.downArrow) {
      const result = validateLabel(labelRef.current);
      setLabelError(result.ok ? null : result.message);
      if (result.ok) {
        setStep(LoginStep.Key);
      }
      return;
    }
    setLabelError(null);
    editText(input, key, labelRef.current, setLabel);
  }
}

function editText(
  input: string,
  key: Parameters<Parameters<typeof useInput>[0]>[1],
  value: string,
  setValue: (value: string) => void
) {
  if (key.backspace || key.delete) {
    const deleteCount = Math.max(1, Array.from(input).filter((char) => char === '\b' || char === '\u007F').length);
    setValue(Array.from(value).slice(0, -deleteCount).join(''));
    return;
  }
  const printable = printableInput(input);
  if (printable.length > 0) {
    setValue(value + printable);
  }
}

function isReturn(input: string, key: Parameters<Parameters<typeof useInput>[0]>[1]) {
  return key.return || input === '\r' || input === '\n';
}

function isShiftTab(input: string, key: Parameters<Parameters<typeof useInput>[0]>[1]) {
  const extendedKey = key as typeof key & { shift?: boolean; shiftTab?: boolean };
  return input === SHIFT_TAB_INPUT || extendedKey.shiftTab === true || (key.tab && extendedKey.shift === true);
}

function useLatest<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}
