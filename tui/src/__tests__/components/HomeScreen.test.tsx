import { render } from 'ink-testing-library';
import { createStore } from 'jotai';
import { describe, expect, it } from 'vitest';
import { App } from '@/App.tsx';
import { BodyPane } from '@components/BodyPane.tsx';
import { formatDisplayCwd } from '@libs/tui/cwdLine.ts';
import type { BodyEntry } from '@libs/tui/bodyRows.ts';
import { PROMPT_MAX_BYTES } from '@state/composer/index.ts';
import {
  bodyEntriesAtom,
  columnsTestOverrideAtom,
  gitStatusLabelTestOverrideAtom,
  productVersionAtom,
  rowsTestOverrideAtom,
  workspaceCwdAtom
} from '@state/global/index.ts';
import { flushInput } from '@test/flushInput.ts';
import { renderWithJotai } from '@test/renderWithJotai.tsx';
import { theme } from '@theme/themeConfig.ts';

const workspaceCwd = 'C:\\Users\\kefeiqian\\Projects\\KQode';

type RenderHomeScreenOptions = {
  productVersion?: string;
  workspaceCwd?: string;
  gitStatusLabel?: string;
  columns?: number;
  rows?: number;
  bodyEntries?: readonly BodyEntry[];
};

function renderHomeScreen({
  productVersion = '0.1.0',
  workspaceCwd: screenWorkspaceCwd = workspaceCwd,
  gitStatusLabel,
  columns,
  rows,
  bodyEntries
}: RenderHomeScreenOptions = {}) {
  const store = createStore();
  store.set(productVersionAtom, productVersion);
  store.set(workspaceCwdAtom, screenWorkspaceCwd);
  if (gitStatusLabel !== undefined) {
    store.set(gitStatusLabelTestOverrideAtom, gitStatusLabel);
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
  return renderWithJotai(<App />, store);
}

describe('HomeScreen', () => {
  it('renders the first-frame identity, cwd, composer, hints, and model label', () => {
    const { lastFrame } = renderHomeScreen({ columns: 100, rows: 20 });

    const output = lastFrame() ?? '';

    expect(output).toContain('KQode');
    expect(output).toContain('v0.1.0');
    expect(output).not.toContain('Preview mode: local Rust backend only');
    expect(output).not.toContain('uses AI');
    expect(output).not.toContain('Check for mistakes');
    expect(output).toContain('~\\Projects\\KQode');
    expect(output.split('\n')).toContain('>');
    expect(output).not.toContain('Ask KQode...');
    expect(output).toContain('/ commands');
    expect(output).toContain('@ mention');
    expect(output).toContain('? help');
    expect(output).not.toContain('tab next tab');
    expect(output).toContain('GPT-5.5');
  });

  it('displays the copied dummy React workspace cwd rather than the TUI package path', () => {
    const copiedWorkspace =
      'C:\\Users\\kefeiqian\\Projects\\KQode\\target\\kqode-test-workspaces\\workspace';
    const { lastFrame } = renderHomeScreen({ workspaceCwd: copiedWorkspace, columns: 120, rows: 20 });

    const output = lastFrame() ?? '';

    expect(output).toContain('~\\Projects\\KQode\\target\\kqode-test-workspaces\\workspace');
    expect(output).toContain('target\\kqode-test-workspaces\\workspace');
    expect(output).not.toContain('~\\Projects\\KQode\\tui');
  });

  it('centralizes Dracula theme tokens including error red', () => {
    expect(theme.colors.foreground).toBe('#F8F8F2');
    expect(theme.colors.muted).toBe('#6272A4');
    expect(theme.colors.accentBlue).toBe('#8BE9FD');
    expect(theme.colors.errorRed).toBe('#FF5555');
    expect(theme.colors.messageBackground).toBe('#44475A');

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
          { kind: 'prompt', text: 'first' },
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
      kind: 'info' as const,
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
      kind: 'info' as const,
      text: `entry ${index + 1}`
    }));
    const { lastFrame } = renderHomeScreen({ bodyEntries: entries, columns: 80, rows: 16 });
    const outputRows = (lastFrame() ?? '').split('\n');
    const cwdRow = outputRows.findIndex((row) => row.includes('Projects\\KQode'));

    expect(cwdRow).toBe(11);
    expect(outputRows.at(cwdRow - 1)).toBe('');
    expect(outputRows.at(cwdRow + 1)).toContain('▄');
    expect(outputRows.at(cwdRow + 2)).toContain('>');
    expect(outputRows.at(cwdRow + 3)).toContain('▀');
    expect(outputRows.at(-1)).toContain('/ commands | @ mention | ? help');
  });

  it('normalizes multiline body entries before applying the row budget', () => {
    const { lastFrame } = render(
      <BodyPane rows={1} columns={80} entries={[{ kind: 'info', text: 'first\nsecond' }]} />
    );

    expect(lastFrame() ?? '').toBe('• first second');
  });

  it('renders body output rows without entry gap rows', () => {
    const { lastFrame } = render(
      <BodyPane
        rows={2}
        columns={80}
        entries={[
          { kind: 'info', text: 'first' },
          { kind: 'info', text: 'second' }
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
      <BodyPane rows={3} columns={24} entries={[{ kind: 'prompt', text: 'hello from user' }]} />
    );
    const outputRows = (lastFrame() ?? '').split('\n');

    expect(outputRows.at(0)).toBe('▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄');
    expect(outputRows.at(1)).toContain('  ❯ hello from user');
    expect(outputRows.at(2)).toBe('▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀');
  });

  it('soft-wraps long body entries without adding entry gaps between wrapped lines', () => {
    const longBody = 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const { lastFrame } = render(
      <BodyPane rows={3} columns={24} entries={[{ kind: 'info', text: longBody }]} />
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

    expect(formatDisplayCwd(workspaceCwd, 'C:\\Users\\kefeiqian')).toBe('~\\Projects\\KQode');
    expect(output).toContain('~\\Projects\\KQode [⎇ feat/first-ink-tui-jsonrpc-backend*+%]');
    expect(output).not.toContain('cwd ');
  });

  it('soft-wraps a long cwd without truncating it', () => {
    const longWorkspace =
      'C:\\Users\\kefeiqian\\Projects\\KQode\\target\\kqode-test-workspaces\\workspace\\dummy-react-app';

    const { lastFrame } = renderHomeScreen({ workspaceCwd: longWorkspace, columns: 40, rows: 12 });
    const output = lastFrame() ?? '';

    expect(output).not.toContain('...');
    expect(output).toContain('target\\kqode-test-works');
    expect(output).toContain('paces\\workspace\\dummy-react-app');
    expect(output).toContain('dummy-react-app');
    expect(output).not.toContain('Ask KQode...');
    expect(output.split('\n')).toHaveLength(12);
    expect(output.split('\n').at(-1)).toContain('/ | @ | ?');
  });

  it('keeps one blank separator row between body output and cwd', () => {
    const entries = Array.from({ length: 10 }, (_, index) => ({
      kind: 'info' as const,
      text: `entry ${index + 1}`
    }));
    const { lastFrame } = renderHomeScreen({ bodyEntries: entries, columns: 80, rows: 12 });
    const outputRows = (lastFrame() ?? '').split('\n');
    const cwdRow = outputRows.findIndex((row) => row.includes('Projects\\KQode'));

    expect(outputRows.at(cwdRow - 1)).toBe('');
    expect(outputRows.at(cwdRow - 2)).toContain('entry 10');
    expect(outputRows.at(cwdRow + 1)).toContain('▄');
    expect(outputRows.at(cwdRow + 2)).toContain('>');
  });

  it('keeps cwd, composer, and left status hints visible around 40 columns by 12 rows', async () => {
    const { lastFrame, stdin } = renderHomeScreen({ columns: 40, rows: 12 });

    const output = lastFrame() ?? '';

    expect(output).toContain('~');
    expect(output.split('\n')).toContain('>');
    expect(output).not.toContain('Ask KQode...');
    expect(output).toContain('/');
    expect(output).toContain('@');
    expect(output).toContain('?');
    expect(output).not.toContain('GPT-5.5');
    const outputRows = output.split('\n');
    expect(outputRows).toHaveLength(12);
    expect(outputRows.at(-1)).toContain('/ | @ | ?');

    stdin.write('a long prompt that wraps across several visible composer rows');
    await flushInput();

    const wrappedOutput = lastFrame() ?? '';
    expect(wrappedOutput).toContain('a long prompt that wraps across severa');
    expect(wrappedOutput).toContain('l visible composer rows');
    const wrappedRows = wrappedOutput.split('\n');
    expect(wrappedRows).toHaveLength(12);
    expect(wrappedRows.at(-4)).toContain('> a long prompt');
    expect(wrappedRows.at(-3)).toContain('l visible composer rows');
    expect(wrappedRows.at(-2)).toContain('▀');
    expect(wrappedRows.at(-1)).toContain('/ | @ | ?');
  });

  it('soft-wraps long prompts instead of truncating them with an ellipsis', async () => {
    const longPrompt = 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const { lastFrame, stdin } = renderHomeScreen({ bodyEntries: [], columns: 24, rows: 12 });

    stdin.write(longPrompt);
    await flushInput();

    const output = lastFrame() ?? '';
    const outputRows = output.split('\n');

    expect(output).not.toContain('...');
    expect(outputRows.at(-5)).toContain('> abcdefghijklmnopqrstuv');
    expect(outputRows.at(-4)).toContain('wxyz0123456789ABCDEFGH');
    expect(outputRows.at(-3)).toContain('IJKLMNOPQRSTUVWXYZ');
    expect(outputRows.at(-2)).toContain('▀');
    expect(outputRows.at(-1)).toContain('/ | @ | ?');
  });

  it('adds submitted prompts to the body when Enter is pressed', async () => {
    const { lastFrame, stdin } = renderHomeScreen({ columns: 80, rows: 12 });

    stdin.write('show this in the body');
    await flushInput();
    stdin.write('\r');
    await flushInput();

    const outputRows = (lastFrame() ?? '').split('\n');
    expect(lastFrame() ?? '').toContain('  ❯ show this in the body');
    expect(outputRows).toContain('>');
  });

  it('keeps submitted multiline prompts on separate indented body rows', async () => {
    const { lastFrame, stdin } = renderHomeScreen({ columns: 80, rows: 14 });

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
      kind: 'info' as const,
      text: `entry ${index + 1}`
    }));
    const { lastFrame, stdin } = renderHomeScreen({ bodyEntries: entries, columns: 80, rows: 12 });

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
    expect(scrolledOutput.split('\n').at(-1)).toContain('GPT-5.5');

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

  it('scrolls body output with mouse wheel events', async () => {
    const entries = Array.from({ length: 10 }, (_, index) => ({
      kind: 'info' as const,
      text: `entry ${index + 1}`
    }));
    const { lastFrame, stdin } = renderHomeScreen({ bodyEntries: entries, columns: 80, rows: 12 });

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

  it('fits over-limit validation feedback inside the 40x12 row budget', async () => {
    const { lastFrame, stdin } = renderHomeScreen({ columns: 40, rows: 12 });

    stdin.write('a'.repeat(PROMPT_MAX_BYTES + 1));
    await flushInput();
    stdin.write('\r');
    await flushInput();

    const errorOutput = lastFrame() ?? '';
    expect(errorOutput).not.toContain('...');
    expect(errorOutput).toContain('ERROR: Prompt is 65537 bytes; maximum is');
    expect(errorOutput).toContain('65536 bytes.');
    const errorRows = errorOutput.split('\n');
    expect(errorRows).toHaveLength(12);
    expect(errorRows.at(-1)).toContain('/ | @ | ?');
  });
});
