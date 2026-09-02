import { atom } from 'jotai';
import type { GitLineDelta } from '@libs/git/lineDelta.ts';

// Value-only session atoms. The composition root seeds both at boot (see
// resolveSessionSeed / bootstrap) so git shell-out stays out of the state layer;
// the exit summary reads them to compute Duration and the Changes delta.
export const sessionStartedAtAtom = atom<number>(0);
export const sessionGitBaselineAtom = atom<GitLineDelta | undefined>(undefined);

/**
 * Durable id of the session currently attached to the runtime, or `undefined`
 * until it becomes resumable (has an accepted turn). The runtime seeds it from
 * `session.list` on the first `enqueued` event, and resume seeds it from the
 * resumed session; the exit summary reads it to print the `kqode --resume=<id>`
 * command. `undefined` means there is nothing to resume, so the row is omitted.
 */
export const currentSessionIdAtom = atom<string | undefined>(undefined);
