import { atom } from 'jotai';
import { readGitStatusLabel } from '@libs/git/gitStatus.ts';
import { workspaceCwdAtom } from '@state/global/workspace.ts';

// Test-only seam to pin a deterministic label; only read under `__TEST__` (see
// `src/globals.d.ts`). The `prod` build folds `__TEST__` to false and DCE's the
// read and — via the `@__PURE__` annotation — this declaration; production reads
// real git status.
export const gitStatusLabelTestOverrideAtom = /* @__PURE__ */ atom<string | undefined>(undefined);

export const gitStatusLabelAtom = atom((get) => {
  const override = __TEST__ ? get(gitStatusLabelTestOverrideAtom) : undefined;
  return override ?? readGitStatusLabel(get(workspaceCwdAtom));
});
