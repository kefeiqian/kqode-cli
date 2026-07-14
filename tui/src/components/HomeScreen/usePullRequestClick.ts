import { useAtomValue, useStore } from 'jotai';
import type { MouseClickEvent } from '@libs/terminal/mouse.ts';
import { openExternalUrl } from '@libs/os/openExternalUrl.ts';
import { resolvePullRequestClickTarget } from '@libs/tui/pullRequestClick.ts';
import { columnsAtom, composerTopAtom, cwdRowsAtom, gitStatusAtom } from '@state/ui/index.ts';
import { workspaceCwdAtom } from '@state/global/index.ts';

/**
 * Returns a handler that opens the pull request when a left click lands on the
 * cwd line's `#3` label, reporting whether it consumed the click.
 *
 * The app owns the mouse (SGR tracking), so the label span is hit-tested here on
 * a plain single click rather than relying on the terminal's modifier+click for
 * the OSC 8 link. `columns`/`composerTop` are read reactively; the click-time
 * values (`cwdRows`, `workspaceCwd`, `gitStatus`) are read from the store when
 * the click fires.
 */
export function usePullRequestClick(): (click: MouseClickEvent) => boolean {
  const store = useStore();
  const columns = useAtomValue(columnsAtom);
  const composerTop = useAtomValue(composerTopAtom);

  return (click: MouseClickEvent): boolean => {
    const url = resolvePullRequestClickTarget({
      clickRow: click.row,
      clickColumn: click.column,
      composerTop,
      cwdRows: store.get(cwdRowsAtom),
      columns,
      workspaceCwd: store.get(workspaceCwdAtom),
      gitStatus: store.get(gitStatusAtom)
    });
    if (url === undefined) {
      return false;
    }
    openExternalUrl(url);
    return true;
  };
}
