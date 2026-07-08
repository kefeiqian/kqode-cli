import { createStore } from 'jotai';
import { describe, expect, it } from 'vitest';
import {
  highlightedResumeSessionAtom,
  moveResumeHighlightAtom,
  ResumeStatus,
  resumeStatusAtom,
  resumeVisibleRowsAtom,
  setResumeRowsAtom,
  visibleResumeSessionsAtom
} from '@state/ui/resume/index.ts';

describe('resume atoms', () => {
  it('moves highlight and windows rows within the visible budget', () => {
    const store = createStore();
    store.set(resumeVisibleRowsAtom, 2);
    store.set(setResumeRowsAtom, [
      { sessionId: 'a', summary: 'a', status: 'Idle', modifiedAt: 3, createdAt: 1, folder: 'A' },
      { sessionId: 'b', summary: 'b', status: 'Idle', modifiedAt: 2, createdAt: 1, folder: 'B' },
      { sessionId: 'c', summary: 'c', status: 'Idle', modifiedAt: 1, createdAt: 1, folder: 'C' }
    ]);

    expect(store.get(resumeStatusAtom)).toBe(ResumeStatus.Loaded);
    expect(store.get(highlightedResumeSessionAtom)?.sessionId).toBe('a');

    store.set(moveResumeHighlightAtom, 1);
    store.set(moveResumeHighlightAtom, 1);

    expect(store.get(highlightedResumeSessionAtom)?.sessionId).toBe('c');
    expect(store.get(visibleResumeSessionsAtom).map((session) => session.sessionId)).toEqual(['b', 'c']);
  });
});
