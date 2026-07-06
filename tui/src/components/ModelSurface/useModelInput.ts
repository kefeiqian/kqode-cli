import { useInput } from 'ink';
import { useAtomValue, useSetAtom } from 'jotai';
import { useRef } from 'react';
import { MODEL_LIST_STATUS_FAILED } from '@contracts/backend/providerMessages.ts';
import { isMouseInput } from '@libs/terminal/mouse.ts';
import {
  highlightedModelRowAtom,
  moveModelHighlightAtom
} from '@state/ui/model/index.ts';

/** Wires `/model` navigation, retry, and selection keybindings. */
export function useModelInput(actions: {
  retryProvider: (providerId: string) => Promise<void>;
  selectModel: (providerId: string, modelId: string) => Promise<void>;
}) {
  const highlighted = useAtomValue(highlightedModelRowAtom);
  const highlightedRef = useLatest(highlighted);
  const moveHighlight = useSetAtom(moveModelHighlightAtom);

  useInput((input, key) => {
    if (isMouseInput(input)) {
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
      }
    }
  });
}

function useLatest<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}
