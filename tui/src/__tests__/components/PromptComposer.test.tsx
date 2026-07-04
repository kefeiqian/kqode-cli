import { createStore } from 'jotai';
import { describe, expect, it, vi } from 'vitest';
import {
  formatVisiblePrompt,
  PromptComposer,
  resolveComposerCursorPosition
} from '@components/PromptComposer/index.tsx';
import { enqueuePromptAtom } from '@state/promptQueue/index.ts';
import { commandMenuDismissedAtom, highlightedCommandAtom } from '@state/ui/commands/index.ts';
import { armedActionAtom } from '@state/ui/index.ts';
import { ArmedAction } from '@constants/ui.ts';
import { helpVisibleAtom } from '@state/ui/help/index.ts';
import { composerStateAtom } from '@state/ui/composer/index.ts';
import { submittedPromptEntriesAtom } from '@state/ui/index.ts';
import { flushInput } from '@test/flushInput.ts';
import { renderWithJotai } from '@test/renderWithJotai.tsx';

describe('PromptComposer', () => {
  it('preserves long prompt content while rendering a wrapped visible view', () => {
    expect(formatVisiblePrompt('abcdefghijklmnop', 8, 3)).toBe('abcdefgh\nijklmnop');
  });

  it('keeps authored newlines in the visible prompt window', () => {
    expect(formatVisiblePrompt('first\nsecond', 10, 3)).toBe('first\nsecond');
  });

  it('indents authored continuation lines under the prompt text', async () => {
    const onSubmit = vi.fn();
    const { lastFrame, stdin } = renderWithJotai(
      <PromptComposer columns={40} onSubmit={onSubmit} />
    );

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

    expect(lastFrame() ?? '').toContain('> 1\n  2\n  3');
  });

  it.each([
    ['Shift+Enter', '\u001B[13;2u'],
    ['Alt+Enter', '\u001B[13;3u'],
    ['Ctrl+Enter', '\u001B[13;5u'],
    ['Ctrl+Shift+Enter', '\u001B[13;6u']
  ])('uses %s to insert a newline without submitting', async (_label, input) => {
    const onSubmit = vi.fn();
    const { stdin } = renderWithJotai(<PromptComposer columns={40} onSubmit={onSubmit} />);

    stdin.write('first');
    await flushInput();
    stdin.write(input);
    await flushInput();
    stdin.write('second');
    await flushInput();

    expect(onSubmit).not.toHaveBeenCalled();
    stdin.write('\r');
    await flushInput();

    expect(onSubmit).toHaveBeenCalledWith('first\nsecond');
  });

  it('uses backslash followed by Enter as a newline fallback without submitting', async () => {
    const onSubmit = vi.fn();
    const { lastFrame, stdin } = renderWithJotai(
      <PromptComposer columns={40} onSubmit={onSubmit} />
    );

    stdin.write('first\\');
    await flushInput();
    stdin.write('\r');
    await flushInput();
    stdin.write('second');
    await flushInput();

    expect(onSubmit).not.toHaveBeenCalled();
    expect(lastFrame() ?? '').toContain('first');
    stdin.write('\r');
    await flushInput();

    expect(onSubmit).toHaveBeenCalledWith('first\nsecond');
  });

  it('submits a trailing backslash instead of inserting a newline when the cursor is at the start', async () => {
    const onSubmit = vi.fn();
    const { stdin } = renderWithJotai(<PromptComposer columns={40} onSubmit={onSubmit} />);

    stdin.write('\\');
    await flushInput();
    stdin.write('\u001B[D');
    await flushInput();
    stdin.write('\r');
    await flushInput();

    expect(onSubmit).toHaveBeenCalledWith('\\');
  });

  it('places the terminal cursor on the active composer row instead of the cwd row', () => {
    // y = composerTop(7) + background-top-pad(1) + cursor-row + INK_CURSOR_ROW_ORIGIN_OFFSET(1, fullscreen)
    expect(resolveComposerCursorPosition('', 38, 7)).toEqual({ x: 2, y: 9 });
    expect(resolveComposerCursorPosition('123', 38, 7)).toEqual({ x: 5, y: 9 });
  });

  it('places the terminal cursor on the active authored multiline composer row', () => {
    expect(resolveComposerCursorPosition('first\nsecond', 38, 7)).toEqual({ x: 8, y: 10 });
  });

  it('places the terminal cursor on the active soft-wrapped composer row', () => {
    const visibleText = formatVisiblePrompt('abcdefghijklmnop', 8, 3);

    expect(visibleText).toBe('abcdefgh\nijklmnop');
    expect(resolveComposerCursorPosition(visibleText, 8, 7)).toEqual({ x: 10, y: 10 });
  });

  it('places the terminal cursor at an authored middle position', () => {
    expect(resolveComposerCursorPosition('abcd', 38, 7, 2)).toEqual({ x: 4, y: 9 });
  });

  it('submits exact non-empty text with leading and trailing spaces, then clears', async () => {
    const onSubmit = vi.fn();
    const { lastFrame, stdin } = renderWithJotai(
      <PromptComposer columns={40} onSubmit={onSubmit} />
    );

    stdin.write('  hello  ');
    await flushInput();
    stdin.write('\r');
    await flushInput();

    expect(onSubmit).toHaveBeenCalledWith('  hello  ');
    expect(lastFrame() ?? '').not.toContain('Ask KQode...');
  });

  it('blocks empty or whitespace-only submits', async () => {
    const onSubmit = vi.fn();
    const { stdin } = renderWithJotai(<PromptComposer columns={40} onSubmit={onSubmit} />);

    stdin.write('   ');
    await flushInput();
    stdin.write('\r');
    await flushInput();

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('keeps slash, mention, and help characters as normal prompt input while ignoring tab', async () => {
    const onSubmit = vi.fn();
    const { lastFrame, stdin } = renderWithJotai(
      <PromptComposer columns={40} onSubmit={onSubmit} />
    );

    stdin.write('/@?');
    await flushInput();
    stdin.write('\t');
    await flushInput();

    const output = lastFrame() ?? '';
    expect(output).toContain('/@?');
    expect(output).not.toContain('\t');
  });

  it('uses left and right arrows to move the input cursor for middle edits', async () => {
    const onSubmit = vi.fn();
    const { lastFrame, stdin } = renderWithJotai(
      <PromptComposer columns={40} onSubmit={onSubmit} />
    );

    stdin.write('abc');
    await flushInput();
    stdin.write('\u001B[D');
    await flushInput();
    stdin.write('X');
    await flushInput();
    stdin.write('\u001B[C');
    await flushInput();
    stdin.write('Y');
    await flushInput();

    expect(lastFrame() ?? '').toContain('> abXcY');
  });

  it('ignores mouse tracking sequences instead of inserting them into the prompt', async () => {
    const onSubmit = vi.fn();
    const { lastFrame, stdin } = renderWithJotai(
      <PromptComposer columns={40} onSubmit={onSubmit} />
    );

    stdin.write('\u001B[<64;1;1M');
    await flushInput();

    const output = lastFrame() ?? '';
    expect(output).not.toContain('[<64;1;1M');
    expect(output.split('\n')).toContain('>');
  });

  it('blocks over-limit input with visible error feedback', async () => {
    const onSubmit = vi.fn();
    const { lastFrame, stdin } = renderWithJotai(
      <PromptComposer columns={80} maxBytes={4} onSubmit={onSubmit} />
    );

    stdin.write('hello');
    await flushInput();

    expect(lastFrame() ?? '').toContain('ERROR: Prompt is 5 bytes; maximum is 4 bytes.');
    stdin.write('\r');
    await flushInput();

    expect(onSubmit).not.toHaveBeenCalled();
    expect(lastFrame() ?? '').toContain('ERROR: Prompt is 5 bytes; maximum is 4 bytes.');
  });

  it('clears after submit and accepts new input while App owns the submitted snapshot', async () => {
    const onSubmit = vi.fn();
    const { lastFrame, stdin } = renderWithJotai(
      <PromptComposer columns={40} onSubmit={onSubmit} />
    );

    stdin.write('first');
    await flushInput();
    stdin.write('\r');
    await flushInput();
    stdin.write('second');
    await flushInput();

    expect(onSubmit).toHaveBeenCalledWith('first');
    expect(lastFrame() ?? '').toContain('second');
  });

  it('runs the default-highlighted /clear on Enter and clears the transcript', async () => {
    const store = createStore();
    await store.set(enqueuePromptAtom, 'hello');
    expect(store.get(submittedPromptEntriesAtom).length).toBeGreaterThan(0);

    const { stdin } = renderWithJotai(<PromptComposer columns={40} />, store);

    stdin.write('/');
    await flushInput();
    stdin.write('\r');
    await flushInput();

    expect(store.get(submittedPromptEntriesAtom)).toEqual([]);
  });

  it('moves the highlighted command with the arrow keys', async () => {
    const store = createStore();
    const { stdin } = renderWithJotai(<PromptComposer columns={40} />, store);

    stdin.write('/');
    await flushInput();
    expect(store.get(highlightedCommandAtom)?.name).toBe('/clear');

    stdin.write('\u001B[B');
    await flushInput();
    expect(store.get(highlightedCommandAtom)?.name).toBe('/exit');

    stdin.write('\u001B[A');
    await flushInput();
    expect(store.get(highlightedCommandAtom)?.name).toBe('/clear');
  });

  it('opens the help viewer when /help is submitted', async () => {
    const store = createStore();
    const { stdin } = renderWithJotai(<PromptComposer columns={40} />, store);

    stdin.write('/help');
    await flushInput();
    stdin.write('\r');
    await flushInput();

    expect(store.get(helpVisibleAtom)).toBe(true);
    expect(store.get(submittedPromptEntriesAtom)).toEqual([]);
  });

  it('completes the highlighted command with Tab without executing it', async () => {
    const store = createStore();
    const { lastFrame, stdin } = renderWithJotai(<PromptComposer columns={40} />, store);

    stdin.write('/cl');
    await flushInput();
    stdin.write('\t');
    await flushInput();

    expect(lastFrame() ?? '').toContain('/clear');
    expect(store.get(submittedPromptEntriesAtom)).toEqual([]);
  });

  it('posts an unknown command and its error into the transcript without sending it', async () => {
    const store = createStore();
    const onSubmit = vi.fn();
    const { stdin } = renderWithJotai(
      <PromptComposer columns={60} onSubmit={onSubmit} />,
      store
    );

    stdin.write('/zzz');
    await flushInput();
    stdin.write('\r');
    await flushInput();

    const entries = store.get(submittedPromptEntriesAtom);
    expect(entries.map((entry) => ({ kind: entry.kind, text: entry.text }))).toEqual([
      { kind: 'user', text: '/zzz' },
      { kind: 'error', text: 'Unknown command: /zzz' }
    ]);
    expect(store.get(composerStateAtom).text).toBe('');
    expect(store.get(composerStateAtom).validationError).toBeNull();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('dismisses the menu with Esc while keeping the typed text', async () => {
    const store = createStore();
    const { lastFrame, stdin } = renderWithJotai(<PromptComposer columns={40} />, store);

    stdin.write('/help');
    await flushInput();
    stdin.write('\u001B');
    await new Promise((resolve) => setTimeout(resolve, 80));

    expect(lastFrame() ?? '').toContain('/help');
    expect(store.get(commandMenuDismissedAtom)).toBe(true);

    stdin.write('x');
    await flushInput();
    expect(store.get(commandMenuDismissedAtom)).toBe(false);
  });

  it('keeps modified Enter as a newline even while a command is being typed', async () => {
    const onSubmit = vi.fn();
    const { stdin } = renderWithJotai(<PromptComposer columns={40} onSubmit={onSubmit} />);

    stdin.write('/');
    await flushInput();
    stdin.write('\u001B[13;5u');
    await flushInput();

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('clears the composer on a second Esc after arming, keeping text on the first', async () => {
    const store = createStore();
    const { lastFrame, stdin } = renderWithJotai(<PromptComposer columns={40} />, store);

    stdin.write('hello');
    await flushInput();
    stdin.write('\u001B');
    await new Promise((resolve) => setTimeout(resolve, 80));

    expect(store.get(armedActionAtom)).toBe(ArmedAction.ClearInput);
    expect(lastFrame() ?? '').toContain('hello');

    stdin.write('\u001B');
    await new Promise((resolve) => setTimeout(resolve, 80));

    expect(store.get(armedActionAtom)).toBeNull();
    expect(lastFrame() ?? '').not.toContain('hello');
  });

  it('disarms the clear confirmation when another key is pressed', async () => {
    const store = createStore();
    const { lastFrame, stdin } = renderWithJotai(<PromptComposer columns={40} />, store);

    stdin.write('hello');
    await flushInput();
    stdin.write('\u001B');
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(store.get(armedActionAtom)).toBe(ArmedAction.ClearInput);

    stdin.write('x');
    await flushInput();
    expect(store.get(armedActionAtom)).toBeNull();
    expect(store.get(composerStateAtom).text).toBe('hellox');
    expect(lastFrame() ?? '').toContain('hellox');
  });
});
