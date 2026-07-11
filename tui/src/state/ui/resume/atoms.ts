import { atom } from 'jotai';
import type { SessionSummary } from '@contracts/backend/index.ts';
import { clamp } from '@libs/math/clamp.ts';

export const ResumeStatus = {
  Loading: 'loading',
  Loaded: 'loaded',
  Empty: 'empty',
  Resuming: 'resuming',
  Failed: 'failed'
} as const;

export type ResumeStatus = (typeof ResumeStatus)[keyof typeof ResumeStatus];

export const resumeSessionsAtom = atom<SessionSummary[]>([]);
export const resumeStatusAtom = atom<ResumeStatus>(ResumeStatus.Loading);
export const resumeErrorAtom = atom<string | null>(null);
export const resumeHighlightIndexAtom = atom(0);
export const resumeWindowOffsetAtom = atom(0);
export const resumeVisibleRowsAtom = atom(1);
export const resumePanelOpenAtom = atom(false);

export const resetResumeSurfaceAtom = atom(null, (_get, set) => {
  set(resumeSessionsAtom, []);
  set(resumeStatusAtom, ResumeStatus.Loading);
  set(resumeErrorAtom, null);
  set(resumeHighlightIndexAtom, 0);
  set(resumeWindowOffsetAtom, 0);
});

export const openResumePanelAtom = atom(null, (_get, set) => {
  set(resumePanelOpenAtom, true);
  set(resetResumeSurfaceAtom);
});

export const closeResumePanelAtom = atom(null, (_get, set) => {
  set(resumePanelOpenAtom, false);
});

export const setResumeRowsAtom = atom(null, (_get, set, sessions: SessionSummary[]) => {
  set(resumeSessionsAtom, sessions);
  set(resumeStatusAtom, sessions.length === 0 ? ResumeStatus.Empty : ResumeStatus.Loaded);
  set(resumeErrorAtom, null);
  set(resumeHighlightIndexAtom, 0);
  set(resumeWindowOffsetAtom, 0);
});

export const setResumeFailureAtom = atom(null, (_get, set, message: string) => {
  set(resumeStatusAtom, ResumeStatus.Failed);
  set(resumeErrorAtom, message);
});

export const setResumeResumingAtom = atom(null, (_get, set) => {
  set(resumeStatusAtom, ResumeStatus.Resuming);
  set(resumeErrorAtom, null);
});

export const moveResumeHighlightAtom = atom(null, (get, set, delta: number) => {
  const sessions = get(resumeSessionsAtom);
  if (sessions.length === 0 || get(resumeStatusAtom) !== ResumeStatus.Loaded) {
    return;
  }
  const nextIndex = clamp(get(resumeHighlightIndexAtom) + delta, 0, sessions.length - 1);
  set(resumeHighlightIndexAtom, nextIndex);
  const visible = get(resumeVisibleRowsAtom);
  const maxOffset = Math.max(0, sessions.length - visible);
  const offset = get(resumeWindowOffsetAtom);
  set(
    resumeWindowOffsetAtom,
    clamp(nextIndex < offset ? nextIndex : Math.max(offset, nextIndex - visible + 1), 0, maxOffset)
  );
});

export const highlightedResumeSessionAtom = atom((get) => {
  const sessions = get(resumeSessionsAtom);
  return sessions[get(resumeHighlightIndexAtom)] ?? null;
});

export const visibleResumeSessionsAtom = atom((get) => {
  const sessions = get(resumeSessionsAtom);
  const offset = get(resumeWindowOffsetAtom);
  return sessions.slice(offset, offset + get(resumeVisibleRowsAtom));
});
