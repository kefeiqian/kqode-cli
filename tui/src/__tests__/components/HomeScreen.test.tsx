import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';
import { BodyPane } from '@components/BodyPane.js';
import { formatDisplayCwd } from '@components/CwdLine.js';
import { HomeScreen } from '@components/HomeScreen/index.js';
import { PROMPT_MAX_BYTES } from '@state/composerAtoms.js';
import { createHomeScreenConfig } from '@state/homeScreenAtoms.js';
import type { HomeScreenOptions } from '@state/homeScreenAtoms.js';
import { flushInput } from '@test/flushInput.js';
import { geminiDarkTheme } from '@theme/themeConfig.js';

const workspaceCwd = 'C:\\Users\\kefeiqian\\Projects\\KQode';

function renderHomeScreen({
  productVersion = '0.1.0',
  workspaceCwd: screenWorkspaceCwd = workspaceCwd,
  ...options
}: Partial<HomeScreenOptions> = {}) {
  return render(
    <HomeScreen
      config={createHomeScreenConfig({
        productVersion,
        workspaceCwd: screenWorkspaceCwd,
        ...options
      })}
    />
  );
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
    expect(output).not.toContain('tui');
  });

  it('centralizes Gemini dark theme tokens including error red', () => {
    expect(geminiDarkTheme.colors.foreground).toBe('#FFFFFF');
    expect(geminiDarkTheme.colors.muted).toBe('#AFAFAF');
    expect(geminiDarkTheme.colors.accentBlue).toBe('#87AFFF');
    expect(geminiDarkTheme.colors.errorRed).toBe('#FF87AF');
    expect(geminiDarkTheme.colors.messageBackground).toBe('#5F5F5F');

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
