import { createStore } from 'jotai';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@libs/os/openExternalUrl.ts', () => ({
  openExternalUrl: vi.fn(() => true)
}));

import { App } from '@/App.tsx';
import type { GitStatus } from '@contracts/backend/index.ts';
import { openExternalUrl } from '@libs/os/openExternalUrl.ts';
import { pullRequestLabelOffset } from '@libs/tui/cwdLine.ts';
import { flushInput } from '@test/flushInput.ts';
import { renderWithJotai } from '@test/renderWithJotai.tsx';
import {
  columnsTestOverrideAtom,
  composerTopAtom,
  cwdRowsAtom,
  gitStatusAtom,
  rowsTestOverrideAtom
} from '@state/ui/index.ts';
import { workspaceCwdAtom } from '@state/global/index.ts';

const workspaceCwd = path.join(os.homedir(), 'Projects', 'KQode');
const url = 'https://github.com/o/r/pull/3';
const gitStatus: GitStatus = { label: '⎇ main*', pullRequestLabel: '#3', pullRequestUrl: url };

/** Renders the App at a wide, single-row-cwd size and returns the click seam. */
function renderApp() {
  const store = createStore();
  store.set(workspaceCwdAtom, workspaceCwd);
  store.set(gitStatusAtom, gitStatus);
  store.set(columnsTestOverrideAtom, 100);
  store.set(rowsTestOverrideAtom, 20);
  const instance = renderWithJotai(<App />, store);
  return { store, ...instance };
}

/** SGR left-button press at a 1-based row/column. */
function clickAt(column: number, row: number): string {
  return `\u001B[<0;${column};${row}M`;
}

describe('pull-request label click wiring', () => {
  beforeEach(() => {
    vi.mocked(openExternalUrl).mockClear();
  });

  it('opens the PR url on a plain click on the #3 label', async () => {
    const { store, stdin } = renderApp();
    await flushInput();

    const composerTop = store.get(composerTopAtom);
    const cwdRows = store.get(cwdRowsAtom);
    const labelStart = pullRequestLabelOffset(workspaceCwd, gitStatus) ?? -1;
    // Single cwd row at rowOffset 0 (1-based row); first character of #3.
    const row = composerTop - cwdRows + 1;
    const column = labelStart + 1;

    stdin.write(clickAt(column, row));
    await flushInput();

    expect(openExternalUrl).toHaveBeenCalledWith(url);
  });

  it('does not open when the click lands on the bracket left of the label', async () => {
    const { store, stdin } = renderApp();
    await flushInput();

    const composerTop = store.get(composerTopAtom);
    const cwdRows = store.get(cwdRowsAtom);
    const labelStart = pullRequestLabelOffset(workspaceCwd, gitStatus) ?? -1;
    const row = composerTop - cwdRows + 1;

    stdin.write(clickAt(labelStart, row)); // column = labelStart → offset labelStart-1 (the '[')
    await flushInput();

    expect(openExternalUrl).not.toHaveBeenCalled();
  });
});
