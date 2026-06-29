import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';
import { BodyPane } from '@components/BodyPane.js';
import { formatDisplayCwd } from '@components/CwdLine.js';
import { HomeScreen } from '@components/HomeScreen.js';
import { clipTextLeft } from '@libs/text/clipText.js';
import { PROMPT_MAX_BYTES } from '@state/composerReducer.js';
import { flushInput } from '@test/flushInput.js';
import { githubDarkTheme } from '@theme/themeConfig.js';

const workspaceCwd = 'C:\\Users\\kefeiqian\\Projects\\KQode';

describe('HomeScreen', () => {
  it('renders the first-frame identity, cwd, composer, hints, and model label', () => {
    const { lastFrame } = render(
      <HomeScreen productVersion="0.1.0" workspaceCwd={workspaceCwd} columns={100} rows={20} />
    );

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
    const { lastFrame } = render(
      <HomeScreen productVersion="0.1.0" workspaceCwd={copiedWorkspace} columns={120} rows={20} />
    );

    const output = lastFrame() ?? '';

    expect(output).toContain('~\\Projects\\KQode\\target\\kqode-test-workspaces\\workspace');
    expect(output).toContain('target\\kqode-test-workspaces\\workspace');
    expect(output).not.toContain('tui');
  });

  it('centralizes GitHub Dark text-only theme tokens including error red', () => {
    expect(githubDarkTheme.colors.foreground).toBe('#c9d1d9');
    expect(githubDarkTheme.colors.muted).toBe('#8b949e');
    expect(githubDarkTheme.colors.accentBlue).toBe('#58a6ff');
    expect(githubDarkTheme.colors.errorRed).toBe('#ff7b72');
    expect(githubDarkTheme.colors.messageBackground).toBe('#141b22');

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
    const { lastFrame } = render(
      <HomeScreen
        productVersion="0.1.0"
        workspaceCwd={workspaceCwd}
        bodyEntries={entries}
        columns={80}
        rows={16}
      />
    );
    const outputRows = (lastFrame() ?? '').split('\n');
    const cwdRow = outputRows.findIndex((row) => row.includes('Projects\\KQode'));

    expect(cwdRow).toBe(13);
    expect(outputRows.at(cwdRow - 1)).toBe('');
    expect(outputRows.at(14)).toBe('>');
    expect(outputRows.at(-1)).toContain('/ commands | @ mention | ? help');
  });

  it('normalizes multiline body entries before applying the row budget', () => {
    const { lastFrame } = render(
      <BodyPane rows={1} columns={80} entries={[{ kind: 'info', text: 'first\nsecond' }]} />
    );

    expect(lastFrame() ?? '').toBe('• first second');
  });

  it('renders a blank gap row between body output rows', () => {
    const { lastFrame } = render(
      <BodyPane
        rows={3}
        columns={80}
        entries={[
          { kind: 'info', text: 'first' },
          { kind: 'info', text: 'second' }
        ]}
      />
    );

    const outputRows = (lastFrame() ?? '').split('\n');
    expect(outputRows.at(0)).toBe('• first');
    expect(outputRows.at(1)?.trim()).toBe('');
    expect(outputRows.at(2)).toBe('• second');
  });

  it('renders user messages with a chevron prompt block style', () => {
    const { lastFrame } = render(
      <BodyPane rows={2} columns={40} entries={[{ kind: 'prompt', text: 'hello from user' }]} />
    );
    const outputRows = (lastFrame() ?? '').split('\n');

    expect(outputRows.at(0)).toContain('  ❯ hello from user');
    expect(outputRows.at(1)?.trim()).toBe('');
  });

  it('can render user messages with half-line background block rows', () => {
    const { lastFrame } = render(
      <BodyPane
        backgroundMode="enabled"
        rows={4}
        columns={24}
        entries={[{ kind: 'prompt', text: 'hello from user' }]}
      />
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
    const { lastFrame } = render(
      <HomeScreen
        productVersion="0.1.0"
        workspaceCwd={workspaceCwd}
        gitStatusLabel="⎇ feat/first-ink-tui-jsonrpc-backend*+%"
        columns={100}
        rows={20}
      />
    );

    const output = lastFrame() ?? '';

    expect(formatDisplayCwd(workspaceCwd, 'C:\\Users\\kefeiqian')).toBe('~\\Projects\\KQode');
    expect(output).toContain('~\\Projects\\KQode [⎇ feat/first-ink-tui-jsonrpc-backend*+%]');
    expect(output).not.toContain('cwd ');
  });

  it('compacts a long cwd from the left before it can crowd the composer and status bar', () => {
    const longWorkspace =
      'C:\\Users\\kefeiqian\\Projects\\KQode\\target\\kqode-test-workspaces\\workspace\\dummy-react-app';

    expect(clipTextLeft(longWorkspace, 32)).toBe('...ces\\workspace\\dummy-react-app');

    const { lastFrame } = render(
      <HomeScreen productVersion="0.1.0" workspaceCwd={longWorkspace} columns={40} rows={12} />
    );
    const output = lastFrame() ?? '';

    expect(output).toContain('...');
    expect(output).toContain('dummy-react-app');
    expect(output.split('\n')).toContain('>');
    expect(output).not.toContain('Ask KQode...');
  });

  it('keeps one blank separator row between body output and cwd', () => {
    const entries = Array.from({ length: 10 }, (_, index) => ({
      kind: 'info' as const,
      text: `entry ${index + 1}`
    }));
    const { lastFrame } = render(
      <HomeScreen
        productVersion="0.1.0"
        workspaceCwd={workspaceCwd}
        bodyEntries={entries}
        columns={80}
        rows={12}
      />
    );
    const outputRows = (lastFrame() ?? '').split('\n');
    const cwdRow = outputRows.findIndex((row) => row.includes('Projects\\KQode'));

    expect(outputRows.at(cwdRow - 1)).toBe('');
    expect(outputRows.at(cwdRow - 2)).toContain('entry 10');
    expect(outputRows.at(cwdRow + 1)).toBe('>');
  });

  it('keeps cwd, composer, and left status hints visible around 40 columns by 12 rows', async () => {
    const { lastFrame, stdin } = render(
      <HomeScreen productVersion="0.1.0" workspaceCwd={workspaceCwd} columns={40} rows={12} />
    );

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
    expect(wrappedRows.at(-3)).toContain('> a long prompt');
    expect(wrappedRows.at(-2)).toContain('l visible composer rows');
    expect(wrappedRows.at(-1)).toContain('/ | @ | ?');
  });

  it('soft-wraps long prompts instead of truncating them with an ellipsis', async () => {
    const longPrompt = 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const { lastFrame, stdin } = render(
      <HomeScreen
        productVersion="0.1.0"
        workspaceCwd={workspaceCwd}
        bodyEntries={[]}
        columns={24}
        rows={12}
      />
    );

    stdin.write(longPrompt);
    await flushInput();

    const output = lastFrame() ?? '';
    const outputRows = output.split('\n');

    expect(output).not.toContain('...');
    expect(outputRows.at(-4)).toContain('> abcdefghijklmnopqrstuv');
    expect(outputRows.at(-3)).toContain('wxyz0123456789ABCDEFGH');
    expect(outputRows.at(-2)).toContain('IJKLMNOPQRSTUVWXYZ');
    expect(outputRows.at(-1)).toContain('/ | @ | ?');
  });

  it('adds submitted prompts to the body when Enter is pressed', async () => {
    const { lastFrame, stdin } = render(
      <HomeScreen productVersion="0.1.0" workspaceCwd={workspaceCwd} columns={80} rows={12} />
    );

    stdin.write('show this in the body');
    await flushInput();
    stdin.write('\r');
    await flushInput();

    const outputRows = (lastFrame() ?? '').split('\n');
    expect(lastFrame() ?? '').toContain('  ❯ show this in the body');
    expect(outputRows).toContain('>');
  });

  it('scrolls body output with PageUp and PageDown while keeping the status bar pinned', async () => {
    const entries = Array.from({ length: 10 }, (_, index) => ({
      kind: 'info' as const,
      text: `entry ${index + 1}`
    }));
    const { lastFrame, stdin } = render(
      <HomeScreen
        productVersion="0.1.0"
        workspaceCwd={workspaceCwd}
        bodyEntries={entries}
        columns={80}
        rows={12}
      />
    );

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
    const { lastFrame, stdin } = render(
      <HomeScreen
        productVersion="0.1.0"
        workspaceCwd={workspaceCwd}
        bodyEntries={entries}
        columns={80}
        rows={12}
      />
    );

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
    const { lastFrame, stdin } = render(
      <HomeScreen productVersion="0.1.0" workspaceCwd={workspaceCwd} columns={40} rows={12} />
    );

    stdin.write('a'.repeat(PROMPT_MAX_BYTES + 1));
    await flushInput();
    stdin.write('\r');
    await flushInput();

    const errorOutput = lastFrame() ?? '';
    expect(errorOutput).toContain('ERROR: Prompt is 65537 bytes; maximum...');
    const errorRows = errorOutput.split('\n');
    expect(errorRows).toHaveLength(12);
    expect(errorRows.at(-1)).toContain('/ | @ | ?');
  });
});
