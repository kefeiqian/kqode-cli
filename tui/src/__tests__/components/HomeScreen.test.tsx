import os from 'node:os';
import path from 'node:path';
import { render } from 'ink-testing-library';
import { createStore } from 'jotai';
import { describe, expect, it, vi } from 'vitest';
import { App } from '@/App.tsx';
import { BodyPane } from '@components/BodyPane.tsx';
import { formatDisplayCwd } from '@libs/tui/cwdLine.ts';
import type { BodyEntry } from '@libs/tui/bodyRows.ts';
import { PROMPT_MAX_BYTES } from '@libs/composer/promptText.ts';
import { NOT_CONFIGURED_MODEL_LABEL } from '@libs/model/index.ts';
import { BodyEntryKind } from '@constants/bodyEntry.ts';
import {
  bodyEntriesAtom,
  bodySelectionAtom,
  columnsTestOverrideAtom,
  gitStatusLabelAtom,
  rowsTestOverrideAtom
} from '@state/ui/index.ts';
import { clipboardClientAtom, productVersionAtom, workspaceCwdAtom } from '@state/global/index.ts';
import { composerStateAtom } from '@state/ui/composer/index.ts';
import { openResumePanelAtom } from '@state/ui/resume/index.ts';
import { flushInput } from '@test/flushInput.ts';
import { renderWithJotai } from '@test/renderWithJotai.tsx';
import { theme } from '@theme/themeConfig.ts';

// Build the workspace under the real home dir (not a hard-coded C:\ string) so
// formatDisplayCwd collapses it to a `~`-relative path on every OS, keeping the
// cwd-row assertions valid on the Linux CI runner as well as Windows.
const workspaceCwd = path.join(os.homedir(), 'Projects', 'KQode');
const displayCwd = `~${path.sep}${path.join('Projects', 'KQode')}`;
const projectsKQode = path.join('Projects', 'KQode');

type RenderHomeScreenOptions = {
  productVersion?: string;
  workspaceCwd?: string;
  gitStatusLabel?: string;
  columns?: number;
  rows?: number;
  bodyEntries?: readonly BodyEntry[];
  resumeOpen?: boolean;
};

function renderHomeScreen({
  productVersion = '0.1.0',
  workspaceCwd: screenWorkspaceCwd = workspaceCwd,
  gitStatusLabel,
  columns,
  rows,
  bodyEntries,
  resumeOpen = false
}: RenderHomeScreenOptions = {}) {
  const store = createStore();
  store.set(productVersionAtom, productVersion);
  store.set(workspaceCwdAtom, screenWorkspaceCwd);
  if (gitStatusLabel !== undefined) {
    store.set(gitStatusLabelAtom, gitStatusLabel);
  }
  if (columns !== undefined) {
    store.set(columnsTestOverrideAtom, columns);
  }
  if (rows !== undefined) {
    store.set(rowsTestOverrideAtom, rows);
  }
  if (bodyEntries !== undefined) {
    store.set(bodyEntriesAtom, bodyEntries);
  }
  if (resumeOpen) {
    store.set(openResumePanelAtom);
  }
  return { ...renderWithJotai(<App />, store), store };
}

describe('HomeScreen', () => {
  it('keeps the body visible and unmounts composer chrome while resume is open', () => {
    const { lastFrame } = renderHomeScreen({
      columns: 100,
      rows: 24,
      bodyEntries: [{ id: 'body', kind: BodyEntryKind.System, text: 'conversation stays visible' }],
      resumeOpen: true
    });

    const output = lastFrame() ?? '';
    expect(output).toContain('conversation stays visible');
    expect(output).toContain('Resume Session:');
    expect(output).not.toContain('> ');
    expect(output).not.toContain(displayCwd);
  });

  it('renders the first-frame identity, cwd, composer, and hints with the model label hidden until the backend resolves', () => {
    const { lastFrame } = renderHomeScreen({ columns: 100, rows: 20 });

    const output = lastFrame() ?? '';

    expect(output).toContain('KQode');
    expect(output).toContain('v0.1.0');
    expect(output).not.toContain('Preview mode: local Rust backend only');
    expect(output).not.toContain('uses AI');
    expect(output).not.toContain('Check for mistakes');
    expect(output).toContain(displayCwd);
    expect(output.split('\n')).toContain('>');
    expect(output).not.toContain('Ask KQode...');
    expect(output).toContain('/ commands');
    expect(output).toContain('@ mention');
    expect(output).not.toContain('tab next tab');
    // The model label stays hidden until the backend resolves it, so the first
    // frame must not flash "not configured".
    expect(output).not.toContain(NOT_CONFIGURED_MODEL_LABEL);
  });

  it('hides the home header and starts body content on the first row once content exists', () => {
    const { lastFrame } = renderHomeScreen({
      columns: 100,
      rows: 20,
      bodyEntries: [{ kind: BodyEntryKind.Success, text: 'conversation starts at top' }]
    });

    const output = lastFrame() ?? '';
    const outputRows = output.split('\n');

    expect(outputRows[0]).not.toContain('KQode');
    expect(outputRows[0]).not.toContain('v0.1.0');
    expect(outputRows[0]).toContain('conversation starts at top');
  });

  it('displays the copied dummy React workspace cwd rather than the TUI package path', () => {
    const copiedWorkspace = path.join(workspaceCwd, 'target', 'kqode-test-workspaces', 'workspace');
    const { lastFrame } = renderHomeScreen({ workspaceCwd: copiedWorkspace, columns: 120, rows: 20 });

    const output = lastFrame() ?? '';

    expect(output).toContain(path.join(displayCwd, 'target', 'kqode-test-workspaces', 'workspace'));
    expect(output).toContain(path.join('target', 'kqode-test-workspaces', 'workspace'));
    expect(output).not.toContain(path.join(displayCwd, 'tui'));
  });

  it('centralizes Tokyo Night theme tokens including error red', () => {
    expect(theme.colors.foreground).toBe('#C0CAF5');
    expect(theme.colors.muted).toBe('#A9B1D6');
    expect(theme.colors.accentBlue).toBe('#7DCFFF');
    expect(theme.colors.errorRed).toBe('#F7768E');
    expect(theme.colors.messageBackground).toBe('#24283B');

    const { lastFrame } = render(
      <BodyPane rows={3} columns={80} entries={[{ kind: 'error', text: 'backend failed' }]} />
    );

    expect(lastFrame() ?? '').toContain('ERROR: backend failed');
  });

  it('prioritizes content over hidden-output markers in a one-row BodyPane budget', () => {
    const { lastFrame } = render(
      <BodyPane
        rows={1}
        columns={80}
        entries={[
          { kind: 'user', text: 'first' },
          { kind: 'success', text: 'second' },
          { kind: 'error', text: 'third' }
        ]}
      />
    );

    const output = lastFrame() ?? '';
    expect(output).toContain('ERROR: third');
    expect(output).not.toContain('... earlier output hidden ...');
    expect(output).not.toContain('... newer output hidden ...');
  });

  it('keeps short BodyPane entries reachable when scrolling', () => {
    const entries = Array.from({ length: 5 }, (_, index) => ({
      kind: 'assistant' as const,
      text: `entry ${index + 1}`
    }));

    expect(render(<BodyPane rows={3} columns={80} entries={entries} />).lastFrame() ?? '').toContain(
      'entry 4'
    );
    expect(
      render(<BodyPane rows={3} columns={80} entries={entries} scrollOffsetRows={2} />).lastFrame() ??
        ''
    ).toContain('entry 3');
    expect(
      render(<BodyPane rows={3} columns={80} entries={entries} scrollOffsetRows={4} />).lastFrame() ??
        ''
    ).toContain('entry 2');
  });

  it('keeps the cwd, composer, and status rows pinned to the bottom when body content is short', () => {
    const entries = Array.from({ length: 4 }, (_, index) => ({
      kind: 'assistant' as const,
      text: `entry ${index + 1}`
    }));
    const { lastFrame } = renderHomeScreen({ bodyEntries: entries, columns: 80, rows: 16 });
    const outputRows = (lastFrame() ?? '').split('\n');
    const cwdRow = outputRows.findIndex((row) => row.includes(projectsKQode));

    expect(cwdRow).toBe(11);
    expect(outputRows.at(cwdRow - 1)).toBe('');
    expect(outputRows.at(cwdRow + 1)).toContain('▄');
    expect(outputRows.at(cwdRow + 2)).toContain('>');
    expect(outputRows.at(cwdRow + 3)).toContain('▀');
    expect(outputRows.at(-1)).toContain('/ commands | @ mention');
  });

  it('keeps multiline body entries on separate rows', () => {
    const { lastFrame } = render(
      <BodyPane rows={4} columns={80} entries={[{ kind: 'assistant', text: 'first\nsecond' }]} />
    );
    const rows = (lastFrame() ?? '').split('\n');

    expect(rows.some((row) => row.includes('• first') && !row.includes('second'))).toBe(true);
    expect(rows.some((row) => row.includes('second') && !row.includes('first'))).toBe(true);
  });

  it('renders body output rows without entry gap rows', () => {
    const { lastFrame } = render(
      <BodyPane
        rows={2}
        columns={80}
        entries={[
          { kind: 'assistant', text: 'first' },
          { kind: 'assistant', text: 'second' }
        ]}
      />
    );
    const outputRows = (lastFrame() ?? '').split('\n');
    expect(outputRows.at(0)).toBe('• first');
    expect(outputRows.at(0)).toBe('• first');
    expect(outputRows.at(1)).toBe('• second');
  });

  it('renders user messages with default half-line background block rows', () => {
    const { lastFrame } = render(
      <BodyPane rows={3} columns={24} entries={[{ kind: 'user', text: 'hello from user' }]} />
    );
    const outputRows = (lastFrame() ?? '').split('\n');

    expect(outputRows.at(0)).toBe('▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄');
    expect(outputRows.at(1)).toContain('  ❯ hello from user');
    expect(outputRows.at(2)).toBe('▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀');
  });

  it('soft-wraps long body entries without adding entry gaps between wrapped lines', () => {
    const longBody = 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const { lastFrame } = render(
      <BodyPane rows={3} columns={24} entries={[{ kind: 'assistant', text: longBody }]} />
    );
    const output = lastFrame() ?? '';
    const outputRows = output.split('\n');

    expect(output).not.toContain('...');
    expect(outputRows.at(0)).toContain('• abcdefghijklmnopqrstuv');
    expect(outputRows.at(1)).toContain('  wxyz0123456789ABCDEFGH');
    expect(outputRows.at(2)).toContain('  IJKLMNOPQRSTUVWXYZ');
  });

  it('formats the cwd row with a home-relative path and bracketed git status', () => {
    const { lastFrame } = renderHomeScreen({
      gitStatusLabel: '⎇ feat/first-ink-tui-jsonrpc-backend*+%',
      columns: 100,
      rows: 20
    });

    const output = lastFrame() ?? '';

    expect(formatDisplayCwd(workspaceCwd)).toBe(displayCwd);
    expect(output).toContain(`${displayCwd} [⎇ feat/first-ink-tui-jsonrpc-backend*+%]`);
    expect(output).not.toContain('cwd ');
  });

  it('soft-wraps a long cwd without truncating it', () => {
    const longWorkspace = path.join(
      workspaceCwd,
      'target',
      'kqode-test-workspaces',
      'workspace',
      'dummy-react-app'
    );

    const { lastFrame } = renderHomeScreen({ workspaceCwd: longWorkspace, columns: 61, rows: 16 });
    const output = lastFrame() ?? '';
    // The cwd wraps across rows; rejoining the trimmed rows must reproduce the
    // full home-relative path, proving it soft-wrapped rather than truncated.
    const flattened = output
      .split('\n')
      .map((row) => row.replace(/\s+$/, ''))
      .join('');

    expect(output).not.toContain('...');
    expect(output).not.toContain('Ask KQode...');
    expect(flattened).toContain(
      path.join(displayCwd, 'target', 'kqode-test-workspaces', 'workspace', 'dummy-react-app')
    );
    expect(output.split('\n')).toHaveLength(16);
    expect(output.split('\n').at(-1)).toContain('/ commands | @ mention');
  });

  it('keeps two blank separator rows between body output and cwd', () => {
    const entries = Array.from({ length: 10 }, (_, index) => ({
      kind: 'assistant' as const,
      text: `entry ${index + 1}`
    }));
    const { lastFrame } = renderHomeScreen({ bodyEntries: entries, columns: 80, rows: 16 });
    const outputRows = (lastFrame() ?? '').split('\n');
    const cwdRow = outputRows.findIndex((row) => row.includes(projectsKQode));

    expect(outputRows.at(cwdRow - 1)).toBe('');
    expect(outputRows.at(cwdRow - 2)).toBe('');
    expect(outputRows.at(cwdRow - 3)).toContain('entry 10');
    expect(outputRows.at(cwdRow + 1)).toContain('▄');
    expect(outputRows.at(cwdRow + 2)).toContain('>');
  });

  it('hides the cwd line while the command palette is open, keeping the status row pinned', async () => {
    const { lastFrame, stdin } = renderHomeScreen({ columns: 80, rows: 16 });
    await flushInput();
    expect(lastFrame() ?? '').toContain(projectsKQode);

    stdin.write('/');
    await flushInput();

    const openOutput = lastFrame() ?? '';
    expect(openOutput).not.toContain(projectsKQode);
    expect(openOutput).toContain('/clear');
    expect(openOutput).toContain('/exit');
    expect(openOutput).toContain('/help');
    expect(openOutput.split('\n').at(-1)).toContain('/ commands | @ mention');
  });

  it('keeps cwd, composer, and status hints visible with the model label hidden until resolved at the minimum 61x16', async () => {
    const { lastFrame, stdin } = renderHomeScreen({ columns: 61, rows: 16 });

    const output = lastFrame() ?? '';

    expect(output).toContain('~');
    expect(output.split('\n')).toContain('>');
    expect(output).not.toContain('Ask KQode...');
    // The model label is hidden until the backend resolves it.
    expect(output).not.toContain(NOT_CONFIGURED_MODEL_LABEL);
    const outputRows = output.split('\n');
    expect(outputRows).toHaveLength(16);
    expect(outputRows.at(-1)).toContain('/ commands | @ mention');

    const typed = 'a long prompt that wraps across several visible composer rows';
    stdin.write(typed);
    await flushInput();

    const wrappedOutput = lastFrame() ?? '';
    const wrappedRows = wrappedOutput.split('\n');
    // The composer soft-wraps across rows; rejoining the rows and dropping the
    // one prompt prefix plus the 2-space padding/indent runs (continuations are
    // indented under `> `) must reproduce the full typed prompt.
    const composerFlattened = wrappedRows
      .map((row) => row.replace(/\s+$/, ''))
      .join('')
      .replace(/ {2,}/g, '')
      .replace('> ', '');

    expect(wrappedOutput).not.toContain('...');
    expect(composerFlattened).toContain(typed);
    expect(wrappedRows).toHaveLength(16);
    expect(wrappedRows.at(-2)).toContain('▀');
    expect(wrappedRows.at(-1)).toContain('/ commands | @ mention');
  });

  it('soft-wraps long prompts instead of truncating them with an ellipsis', async () => {
    const longPrompt = 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const { lastFrame, stdin } = renderHomeScreen({ bodyEntries: [], columns: 61, rows: 16 });

    stdin.write(longPrompt);
    await flushInput();

    const output = lastFrame() ?? '';
    const outputRows = output.split('\n');
    const composerFlattened = outputRows
      .map((row) => row.replace(/\s+$/, ''))
      .join('')
      .replace(/ {2,}/g, '')
      .replace('> ', '');

    expect(output).not.toContain('...');
    expect(composerFlattened).toContain(longPrompt);
    expect(outputRows.at(-2)).toContain('▀');
    expect(outputRows.at(-1)).toContain('/ commands | @ mention');
  });

  it('adds submitted prompts to the body when Enter is pressed', async () => {
    const { lastFrame, stdin } = renderHomeScreen({ columns: 80, rows: 16 });

    stdin.write('show this in the body');
    await flushInput();
    stdin.write('\r');
    await flushInput();

    const outputRows = (lastFrame() ?? '').split('\n');
    expect(lastFrame() ?? '').toContain('  ❯ show this in the body');
    expect(outputRows).toContain('>');
  });

  it('keeps submitted multiline prompts on separate indented body rows', async () => {
    const { lastFrame, stdin } = renderHomeScreen({ columns: 80, rows: 16 });

    stdin.write('1');
    await flushInput();
    stdin.write('\u001B[13;5u');
    await flushInput();
    stdin.write('2');
    await flushInput();
    stdin.write('\u001B[13;5u');
    await flushInput();
    stdin.write('3');
    await flushInput();
    stdin.write('\r');
    await flushInput();

    expect(lastFrame() ?? '').toContain('  ❯ 1\n    2\n    3');
  });

  it('scrolls body output with PageUp and PageDown while keeping the status bar pinned', async () => {
    const entries = Array.from({ length: 10 }, (_, index) => ({
      kind: 'assistant' as const,
      text: `entry ${index + 1}`
    }));
    const { lastFrame, stdin } = renderHomeScreen({ bodyEntries: entries, columns: 80, rows: 16 });

    expect(lastFrame() ?? '').toContain('entry 10');

    stdin.write('\u001B[5~');
    await flushInput();

    const scrolledOutput = lastFrame() ?? '';
    expect(scrolledOutput).toContain('entry 6');
    expect(scrolledOutput).toContain('entry 7');
    expect(scrolledOutput).not.toContain('... earlier output hidden ...');
    expect(scrolledOutput).not.toContain('... newer output hidden ...');
    expect(scrolledOutput).toContain('┃');
    expect(scrolledOutput).toContain('│');
    expect(scrolledOutput.split('\n').at(-1)).toContain(NOT_CONFIGURED_MODEL_LABEL);

    stdin.write('\u001B[5~');
    await flushInput();
    stdin.write('\u001B[5~');
    await flushInput();
    const topOutput = lastFrame() ?? '';

    stdin.write('\u001B[6~');
    await flushInput();

    const pagedDownOutput = lastFrame() ?? '';
    expect(pagedDownOutput).not.toBe(topOutput);

    stdin.write('\u001B[6~');
    await flushInput();
    stdin.write('\u001B[6~');
    await flushInput();

    const bottomOutput = lastFrame() ?? '';
    expect(bottomOutput).toContain('entry 10');
    expect(bottomOutput).not.toContain('... newer output hidden ...');
  });

  it('no longer treats Ctrl+R as a mode toggle and keeps the composer active', async () => {
    const { stdin, store } = renderHomeScreen({ columns: 100, rows: 16 });
    await flushInput();

    // Ctrl+R (DC2, \u0012) is unbound now: it enters no mode, so the composer
    // stays active and the following text lands in it instead of being swallowed.
    stdin.write('\u0012');
    await flushInput();
    stdin.write('hi');
    await flushInput();

    expect(store.get(composerStateAtom).text).toBe('hi');
    expect(store.get(bodySelectionAtom)).toBeNull();
  });

  it('dismisses an active highlight on a printable key that still reaches the composer', async () => {
    const { stdin, store } = renderHomeScreen({ columns: 100, rows: 16 });
    await flushInput();
    store.set(bodySelectionAtom, {
      anchor: { rowIndex: 0, column: 0 },
      focus: { rowIndex: 0, column: 3 }
    });
    await flushInput();

    stdin.write('z');
    await flushInput();

    // Non-consuming dismissal: the highlight clears and the key still inserts.
    expect(store.get(bodySelectionAtom)).toBeNull();
    expect(store.get(composerStateAtom).text).toBe('z');
  });

  it('dismisses an active highlight on Esc', async () => {
    const { stdin, store } = renderHomeScreen({ columns: 100, rows: 16 });
    await flushInput();
    store.set(bodySelectionAtom, {
      anchor: { rowIndex: 0, column: 0 },
      focus: { rowIndex: 0, column: 3 }
    });
    await flushInput();

    // A lone Esc byte is flushed only after Ink's escape-code timeout elapses.
    stdin.write('\u001B');
    await new Promise((resolve) => setTimeout(resolve, 80));

    expect(store.get(bodySelectionAtom)).toBeNull();
  });

  it('keeps an active highlight while scroll keys page the transcript', async () => {
    const entries = Array.from({ length: 10 }, (_, index) => ({
      kind: 'assistant' as const,
      text: `entry ${index + 1}`
    }));
    const { lastFrame, stdin, store } = renderHomeScreen({
      bodyEntries: entries,
      columns: 100,
      rows: 16
    });
    await flushInput();
    store.set(bodySelectionAtom, {
      anchor: { rowIndex: 0, column: 0 },
      focus: { rowIndex: 1, column: 4 }
    });
    await flushInput();

    const frameBefore = lastFrame() ?? '';
    stdin.write('\u001B[5~');
    await flushInput();

    expect(lastFrame() ?? '').not.toBe(frameBefore);
    expect(store.get(bodySelectionAtom)).not.toBeNull();

    // PageDown and End keep the highlight too — none of the scroll keys dismiss.
    stdin.write('\u001B[6~');
    await flushInput();
    expect(store.get(bodySelectionAtom)).not.toBeNull();

    stdin.write('\u001B[F');
    await flushInput();
    expect(store.get(bodySelectionAtom)).not.toBeNull();
  });

  // --- Mode-less drag-to-select + right-click copy (no Ctrl+R gate) ---

  it('drags to select without copying, then copies and clears on right-click', async () => {
    const entries = Array.from({ length: 10 }, (_, index) => ({
      kind: 'assistant' as const,
      text: `entry ${index + 1}`
    }));
    const writeText = vi.fn().mockResolvedValue(true);
    const { stdin, store } = renderHomeScreen({ bodyEntries: entries, columns: 100, rows: 16 });
    store.set(clipboardClientAtom, { readText: vi.fn(), writeText });
    await flushInput();

    // Body rows span SGR rows 2..9 at rows=16; press/drag/release on row 3.
    // Left press = button 0 `M`, drag = motion bit 32 `M`, release = `m`.
    stdin.write('\u001B[<0;1;3M');
    await flushInput();
    stdin.write('\u001B[<32;40;3M');
    await flushInput();
    stdin.write('\u001B[<0;40;3m');
    await flushInput();

    // The drag-release only highlights — nothing is copied yet.
    expect(store.get(bodySelectionAtom)).not.toBeNull();
    expect(writeText).not.toHaveBeenCalled();

    // A right-click (button 2) copies the selection, then clears the highlight.
    stdin.write('\u001B[<2;40;3M');
    await flushInput();

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('entry'));
    expect(store.get(bodySelectionAtom)).toBeNull();
  });

  it('positions the composer caret on a click without selecting or copying', async () => {
    const writeText = vi.fn().mockResolvedValue(true);
    const { stdin, store } = renderHomeScreen({ columns: 100, rows: 16 });
    store.set(clipboardClientAtom, { readText: vi.fn(), writeText });
    store.set(composerStateAtom, { text: 'hello world', cursorIndex: 11, validationError: null });
    await flushInput();

    // Composer text row 0 is SGR row 14 (composerTop=12 + top padding). Column 8
    // lands inside the prompt text after the '> ' prefix.
    stdin.write('\u001B[<0;8;14M');
    await flushInput();
    stdin.write('\u001B[<0;8;14m');
    await flushInput();

    expect(store.get(bodySelectionAtom)).toBeNull();
    expect(writeText).not.toHaveBeenCalled();
    expect(store.get(composerStateAtom).cursorIndex).toBeLessThan(11);
  });

  it('keeps scrolling and preserves the selection when the wheel turns mid-drag', async () => {
    const entries = Array.from({ length: 10 }, (_, index) => ({
      kind: 'assistant' as const,
      text: `entry ${index + 1}`
    }));
    const { lastFrame, stdin, store } = renderHomeScreen({
      bodyEntries: entries,
      columns: 100,
      rows: 16
    });
    await flushInput();

    stdin.write('\u001B[<0;1;3M');
    await flushInput();
    stdin.write('\u001B[<32;10;3M');
    await flushInput();
    const selectionMidDrag = store.get(bodySelectionAtom);
    expect(selectionMidDrag).not.toBeNull();

    const frameBefore = lastFrame() ?? '';
    stdin.write('\u001B[<64;1;3M');
    await flushInput();

    expect(lastFrame() ?? '').not.toBe(frameBefore);
    // Selection is stored in absolute row indices, so scrolling does not lose it.
    expect(store.get(bodySelectionAtom)).toEqual(selectionMidDrag);
  });

  it('clears a prior highlight and copies nothing on a click without a drag', async () => {
    const entries = Array.from({ length: 10 }, (_, index) => ({
      kind: 'assistant' as const,
      text: `entry ${index + 1}`
    }));
    const writeText = vi.fn().mockResolvedValue(true);
    const { stdin, store } = renderHomeScreen({ bodyEntries: entries, columns: 100, rows: 16 });
    store.set(clipboardClientAtom, { readText: vi.fn(), writeText });
    store.set(bodySelectionAtom, {
      anchor: { rowIndex: 0, column: 0 },
      focus: { rowIndex: 1, column: 5 }
    });
    await flushInput();

    stdin.write('\u001B[<0;5;3M');
    await flushInput();
    stdin.write('\u001B[<0;5;3m');
    await flushInput();

    const selection = store.get(bodySelectionAtom);
    expect(selection).not.toBeNull();
    // A click without a drag leaves an empty selection (anchor === focus), so the
    // old highlight is gone and nothing is copied.
    expect(selection?.anchor).toEqual(selection?.focus);
    expect(writeText).not.toHaveBeenCalled();
  });

  it('keeps a gesture with the region it started in', async () => {
    const entries = Array.from({ length: 10 }, (_, index) => ({
      kind: 'assistant' as const,
      text: `entry ${index + 1}`
    }));
    const { stdin, store } = renderHomeScreen({ bodyEntries: entries, columns: 100, rows: 16 });
    await flushInput();

    // A drag that starts in the composer never creates a body selection.
    stdin.write('\u001B[<0;8;14M');
    await flushInput();
    stdin.write('\u001B[<32;8;3M');
    await flushInput();
    expect(store.get(bodySelectionAtom)).toBeNull();
    stdin.write('\u001B[<0;8;3m');
    await flushInput();

    // A drag that starts in the body never moves the composer caret.
    const caretBefore = store.get(composerStateAtom).cursorIndex;
    stdin.write('\u001B[<0;1;3M');
    await flushInput();
    stdin.write('\u001B[<32;40;14M');
    await flushInput();
    expect(store.get(composerStateAtom).cursorIndex).toBe(caretBefore);
    expect(store.get(bodySelectionAtom)).not.toBeNull();
  });

  it('makes no selection on a body press while a docked panel is open', async () => {
    const entries = Array.from({ length: 10 }, (_, index) => ({
      kind: 'assistant' as const,
      text: `entry ${index + 1}`
    }));
    const { stdin, store } = renderHomeScreen({
      bodyEntries: entries,
      columns: 100,
      rows: 16,
      resumeOpen: true
    });
    await flushInput();

    stdin.write('\u001B[<0;1;3M');
    await flushInput();
    stdin.write('\u001B[<32;40;3M');
    await flushInput();

    expect(store.get(bodySelectionAtom)).toBeNull();
  });

  it('scrolls body output with mouse wheel events', async () => {
    const entries = Array.from({ length: 10 }, (_, index) => ({
      kind: 'assistant' as const,
      text: `entry ${index + 1}`
    }));
    const { lastFrame, stdin } = renderHomeScreen({ bodyEntries: entries, columns: 80, rows: 16 });

    stdin.write('\u001B[<64;1;1M');
    await flushInput();

    const scrolledOutput = lastFrame() ?? '';
    expect(scrolledOutput).toContain('entry 6');
    expect(scrolledOutput).toContain('entry 7');

    stdin.write('\u001B[<65;1;1M');
    await flushInput();

    const bottomOutput = lastFrame() ?? '';
    expect(bottomOutput).toContain('entry 10');
  });

  it('copies the active selection to the clipboard on right-click, then clears the highlight', async () => {
    const { stdin, store } = renderHomeScreen({
      bodyEntries: [{ kind: BodyEntryKind.Success, text: 'selectable line' }],
      columns: 80,
      rows: 16
    });
    const writeText = vi.fn().mockResolvedValue(true);
    store.set(clipboardClientAtom, { readText: vi.fn(), writeText });
    store.set(bodySelectionAtom, {
      anchor: { rowIndex: 0, column: 0 },
      focus: { rowIndex: 0, column: 10 }
    });
    await flushInput();

    // SGR right-button press (button 2).
    stdin.write('\u001B[<2;5;3M');
    await flushInput();

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('selectable'));
    expect(store.get(bodySelectionAtom)).toBeNull();
    // The clipboard is copied into, never pasted back into the composer.
    expect(store.get(composerStateAtom).text).toBe('');
  });

  it('does not touch the clipboard or composer on a right-click with no selection', async () => {
    const { stdin, store } = renderHomeScreen({ columns: 80, rows: 16 });
    const readText = vi.fn().mockResolvedValue('should not paste');
    const writeText = vi.fn();
    store.set(clipboardClientAtom, { readText, writeText });
    await flushInput();

    stdin.write('\u001B[<2;5;13M');
    await flushInput();

    // Right-click no longer pastes: nothing is read, written, or inserted.
    expect(readText).not.toHaveBeenCalled();
    expect(writeText).not.toHaveBeenCalled();
    expect(store.get(composerStateAtom).text).toBe('');
  });

  it('fits over-limit validation feedback inside the 61x16 row budget', async () => {
    const { lastFrame, stdin } = renderHomeScreen({ columns: 61, rows: 16 });

    stdin.write('a'.repeat(PROMPT_MAX_BYTES + 1));
    await flushInput();
    stdin.write('\r');
    await flushInput();

    const errorOutput = lastFrame() ?? '';
    expect(errorOutput).not.toContain('...');
    expect(errorOutput).toContain('ERROR: Prompt is 65537 bytes; maximum is');
    expect(errorOutput).toContain('65536 bytes.');
    const errorRows = errorOutput.split('\n');
    expect(errorRows).toHaveLength(16);
    expect(errorRows.at(-1)).toContain('/ commands | @ mention');
  });
});
