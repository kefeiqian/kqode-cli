import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStore } from 'jotai';
import { PromptComposer } from '@components/PromptComposer/index.tsx';
import { resetSubmitCaptureForTests } from '@libs/composer/submitCapture.ts';
import { promptQueueAtom } from '@state/promptQueue/index.ts';
import { helpVisibleAtom } from '@state/ui/help/index.ts';
import { bodyScrollOffsetRowsAtom, submittedPromptEntriesAtom } from '@state/ui/index.ts';
import { commandMenuDismissedAtom, commandMenuOpenAtom, highlightedCommandAtom } from '@state/ui/commands/index.ts';
import { composerStateAtom } from '@state/ui/composer/index.ts';
import { flushInput } from '@test/flushInput.ts';
import { renderWithJotai } from '@test/renderWithJotai.tsx';

const UP = '\u001B[A';
const DOWN = '\u001B[B';
const ESC = '\u001B';
const CTRL_ENTER = '\u001B[13;5u';

beforeEach(() => {
  resetSubmitCaptureForTests();
});

afterEach(() => {
  resetSubmitCaptureForTests();
});

async function writeAndFlush(stdin: { write: (text: string) => unknown }, text: string): Promise<void> {
  stdin.write(text);
  await flushInput();
}

describe('PromptComposer history recall', () => {
  it('moves vertically within multi-line text before recalling at the first-line boundary', async () => {
    const store = createStore();
    const { stdin } = renderWithJotai(<PromptComposer columns={40} />, store);

    await writeAndFlush(stdin, 'previous');
    await writeAndFlush(stdin, '\r');
    store.set(composerStateAtom, { text: 'aaa\nbbb\nccc', cursorIndex: 5, validationError: null });
    await flushInput();

    await writeAndFlush(stdin, UP);
    expect(store.get(composerStateAtom)).toMatchObject({ text: 'aaa\nbbb\nccc', cursorIndex: 1 });

    await writeAndFlush(stdin, UP);
    expect(store.get(composerStateAtom)).toMatchObject({ text: 'previous', cursorIndex: 'previous'.length });
  });

  it('recalls a single-line submission and restores the draft past newest', async () => {
    const store = createStore();
    const { stdin } = renderWithJotai(<PromptComposer columns={40} />, store);

    await writeAndFlush(stdin, 'foo');
    await writeAndFlush(stdin, '\r');
    await writeAndFlush(stdin, 'half');

    await writeAndFlush(stdin, UP);
    expect(store.get(composerStateAtom)).toMatchObject({ text: 'foo', cursorIndex: 3 });

    await writeAndFlush(stdin, DOWN);
    expect(store.get(composerStateAtom)).toMatchObject({ text: 'half', cursorIndex: 4 });

    await writeAndFlush(stdin, DOWN);
    expect(store.get(composerStateAtom)).toMatchObject({ text: 'half', cursorIndex: 4 });
  });

  it('captures prompt, exact command, unknown command, and menu-run command in recall order', async () => {
    const store = createStore();
    const onSubmit = vi.fn();
    const { stdin } = renderWithJotai(<PromptComposer columns={40} onSubmit={onSubmit} />, store);

    await writeAndFlush(stdin, 'hello');
    await writeAndFlush(stdin, '\r');
    await writeAndFlush(stdin, '/help');
    await writeAndFlush(stdin, ESC);
    await new Promise((resolve) => setTimeout(resolve, 80));
    await writeAndFlush(stdin, '\r');
    await writeAndFlush(stdin, '/hepl');
    await writeAndFlush(stdin, '\r');
    await writeAndFlush(stdin, '/');
    await writeAndFlush(stdin, '\r');

    expect(onSubmit).toHaveBeenCalledWith('hello');
    expect(store.get(helpVisibleAtom)).toBe(true);
    for (const expected of ['/clear', '/hepl', '/help', 'hello']) {
      await writeAndFlush(stdin, UP);
      expect(store.get(composerStateAtom).text).toBe(expected);
    }
  });

  it('preserves newlines in recalled entries and on resubmit', async () => {
    const store = createStore();
    const onSubmit = vi.fn();
    const { stdin } = renderWithJotai(<PromptComposer columns={40} onSubmit={onSubmit} />, store);

    await writeAndFlush(stdin, 'older');
    await writeAndFlush(stdin, '\r');
    await writeAndFlush(stdin, 'first');
    await writeAndFlush(stdin, CTRL_ENTER);
    await writeAndFlush(stdin, 'second');
    await writeAndFlush(stdin, '\r');

    await writeAndFlush(stdin, UP);
    expect(store.get(composerStateAtom)).toMatchObject({ text: 'first\nsecond', cursorIndex: 12 });

    await writeAndFlush(stdin, UP);
    expect(store.get(composerStateAtom)).toMatchObject({ text: 'first\nsecond', cursorIndex: 5 });

    await writeAndFlush(stdin, UP);
    expect(store.get(composerStateAtom).text).toBe('older');

    await writeAndFlush(stdin, DOWN);
    await writeAndFlush(stdin, '\r');
    expect(onSubmit).toHaveBeenLastCalledWith('first\nsecond');
  });

  it('does not capture whitespace-only or over-limit submits', async () => {
    const store = createStore();
    const onSubmit = vi.fn();
    const { stdin } = renderWithJotai(
      <PromptComposer columns={40} maxBytes={4} onSubmit={onSubmit} />,
      store
    );

    await writeAndFlush(stdin, '   ');
    await writeAndFlush(stdin, '\r');
    expect(store.get(composerStateAtom).text).toBe('   ');

    store.set(composerStateAtom, { text: 'hello', cursorIndex: 5, validationError: null });
    await writeAndFlush(stdin, '\r');
    expect(store.get(composerStateAtom).text).toBe('hello');

    store.set(composerStateAtom, { text: '', cursorIndex: 0, validationError: null });
    await writeAndFlush(stdin, UP);
    expect(store.get(composerStateAtom).text).toBe('');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('clears local transcript and scroll while leaving recall history intact', async () => {
    const store = createStore();
    const { stdin } = renderWithJotai(<PromptComposer columns={40} />, store);

    await writeAndFlush(stdin, 'remember me');
    await writeAndFlush(stdin, '\r');
    store.set(bodyScrollOffsetRowsAtom, 3);
    expect(store.get(promptQueueAtom)).not.toEqual([]);

    await writeAndFlush(stdin, '/clear');
    await writeAndFlush(stdin, '\r');

    expect(store.get(promptQueueAtom)).toEqual([]);
    expect(store.get(submittedPromptEntriesAtom)).toEqual([]);
    expect(store.get(bodyScrollOffsetRowsAtom)).toBe(0);

    await writeAndFlush(stdin, UP);
    expect(store.get(composerStateAtom).text).toBe('/clear');
    await writeAndFlush(stdin, UP);
    expect(store.get(composerStateAtom).text).toBe('remember me');
  });

  it('keeps menu arrow precedence, dismisses on recall, and reopens on edit', async () => {
    const store = createStore();
    const { stdin } = renderWithJotai(<PromptComposer columns={40} />, store);

    await writeAndFlush(stdin, '/clear');
    await writeAndFlush(stdin, ESC);
    await new Promise((resolve) => setTimeout(resolve, 80));
    await writeAndFlush(stdin, '\r');
    await writeAndFlush(stdin, '/');
    expect(store.get(commandMenuOpenAtom)).toBe(true);
    expect(store.get(highlightedCommandAtom)?.name).toBe('/clear');

    await writeAndFlush(stdin, DOWN);
    expect(store.get(highlightedCommandAtom)?.name).toBe('/exit');
    expect(store.get(composerStateAtom).text).toBe('/');

    store.set(composerStateAtom, { text: '', cursorIndex: 0, validationError: null });
    await writeAndFlush(stdin, UP);
    expect(store.get(composerStateAtom).text).toBe('/clear');
    expect(store.get(commandMenuDismissedAtom)).toBe(true);
    expect(store.get(commandMenuOpenAtom)).toBe(false);

    await writeAndFlush(stdin, 'x');
    expect(store.get(commandMenuDismissedAtom)).toBe(false);
    expect(store.get(commandMenuOpenAtom)).toBe(true);
  });
});
