import { useInput } from 'ink';
import { useAtomValue, useSetAtom } from 'jotai';
import { useRef } from 'react';
import { isMouseInput } from '@libs/terminal/mouse.ts';
import {
  highlightedResumeSessionAtom,
  moveResumeHighlightAtom,
  ResumeStatus,
  resumeStatusAtom
} from '@state/ui/resume/index.ts';

export function useResumeInput(onSelect: (sessionId: string) => Promise<void>) {
  const highlighted = useAtomValue(highlightedResumeSessionAtom);
  const status = useAtomValue(resumeStatusAtom);
  const highlightedRef = useLatest(highlighted);
  const statusRef = useLatest(status);
  const moveHighlight = useSetAtom(moveResumeHighlightAtom);

  useInput((input, key) => {
    if (isMouseInput(input) || statusRef.current === ResumeStatus.Loading || statusRef.current === ResumeStatus.Resuming) {
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
      const session = highlightedRef.current;
      if (session !== null) {
        void onSelect(session.sessionId);
      }
    }
  });
}

function useLatest<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}
