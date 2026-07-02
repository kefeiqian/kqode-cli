import { atom } from 'jotai';
import type { GitLineDelta } from '@libs/git/lineDelta.ts';

// Value-only session atoms. The composition root seeds both at boot (see
// resolveSessionSeed / bootstrap) so git shell-out stays out of the state layer;
// the exit summary reads them to compute Duration and the Changes delta.
export const sessionStartedAtAtom = atom<number>(0);
export const sessionGitBaselineAtom = atom<GitLineDelta | undefined>(undefined);
