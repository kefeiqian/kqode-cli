import { useInput } from 'ink';
import { useAtomValue, useSetAtom } from 'jotai';
import { useRef } from 'react';
import { MODEL_LIST_STATUS_FAILED } from '@contracts/backend/providerMessages.ts';
import { isMouseInput } from '@libs/terminal/mouse.ts';
import { PROVIDER_ID_CUSTOM } from '@state/ui/connect/index.ts';
import {
  highlightedModelRowAtom,
  inlineConnectInFlightAtom,
  inlineConnectProviderIdAtom,
  inlineConnectOutcomeAtom,
  inlineConnectRequestErrorAtom,
  moveModelHighlightAtom
} from '@state/ui/model/index.ts';
import { MODEL_LOAD_STATUS_NOT_CONNECTED } from '@state/ui/model/index.ts';

/** Wires `/model` navigation, retry, and selection keybindings. */
export function useModelInput(actions: {
  cancelInlineConnect: () => void;
  retryProvider: (providerId: string) => Promise<void>;
  selectModel: (providerId: string, modelId: string) => Promise<void>;
  startInlineConnect: (providerId: string) => void;
}) {
  const highlighted = useAtomValue(highlightedModelRowAtom);
  const inlineProviderId = useAtomValue(inlineConnectProviderIdAtom);
  const inlineInFlight = useAtomValue(inlineConnectInFlightAtom);
  const inlineOutcome = useAtomValue(inlineConnectOutcomeAtom);
  const inlineRequestError = useAtomValue(inlineConnectRequestErrorAtom);
  const highlightedRef = useLatest(highlighted);
  const inlineProviderIdRef = useLatest(inlineProviderId);
  const inlineInFlightRef = useLatest(inlineInFlight);
  const inlineOutcomeRef = useLatest(inlineOutcome);
  const inlineRequestErrorRef = useLatest(inlineRequestError);
  const moveHighlight = useSetAtom(moveModelHighlightAtom);

  useInput((input, key) => {
    if (isMouseInput(input)) {
      return;
    }
    if (inlineInFlightRef.current) {
      return;
    }
    if (inlineProviderIdRef.current !== null) {
      if (isEscape(input, key)) {
        actions.cancelInlineConnect();
      }
      return;
    }
    if ((inlineOutcomeRef.current !== null || inlineRequestErrorRef.current !== null) && isEscape(input, key)) {
      actions.cancelInlineConnect();
      return;
    }
    if (key.upArrow) {
      moveHighlight(-1);
      return;
    }
    if (key.downArrow) {
      moveHighlight(1);
      return;
    }
    if (key.return || input === '\r' || input === '\n') {
      const row = highlightedRef.current;
      if (row?.type === 'model') {
        void actions.selectModel(row.providerId, row.modelId);
      } else if (row?.type === 'status' && row.status === MODEL_LIST_STATUS_FAILED) {
        void actions.retryProvider(row.providerId);
      } else if (
        row?.type === 'status' &&
        row.status === MODEL_LOAD_STATUS_NOT_CONNECTED &&
        row.providerId !== PROVIDER_ID_CUSTOM
      ) {
        actions.startInlineConnect(row.providerId);
      }
    }
  });
}

function isEscape(input: string, key: Parameters<Parameters<typeof useInput>[0]>[1]) {
  return key.escape || input === '\u001B';
}

function useLatest<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}
