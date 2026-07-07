import { createStore } from 'jotai';
import { describe, expect, it } from 'vitest';
import {
  commandMenuDesiredRowsAtom,
  commandMenuDismissedAtom,
  commandMenuHighlightIndexAtom,
  commandMenuMatchesAtom,
  commandMenuOpenAtom,
  highlightedCommandAtom,
  moveCommandHighlightAtom,
  resetCommandHighlightAtom
} from '@state/ui/commands/index.ts';
import { COMMAND_MENU_PANEL_ROWS } from '@constants/ui.ts';
import { CommandId } from '@libs/commands/registry.ts';
import { composerStateAtom } from '@state/ui/composer/index.ts';
import { BACKEND_LOADING_HINT, startupStatusHintAtom } from '@state/ui/statusHint.ts';

type Store = ReturnType<typeof createStore>;

const setText = (store: Store, text: string): void => {
  store.set(composerStateAtom, { text, cursorIndex: text.length, validationError: null });
};

describe('command menu atoms', () => {
  it('opens on a slash query with all matches and the top highlighted', () => {
    const store = createStore();
    setText(store, '/');

    expect(store.get(commandMenuOpenAtom)).toBe(true);
    expect(store.get(commandMenuMatchesAtom).map((command) => command.id)).toEqual([
      CommandId.Clear,
      CommandId.Exit,
      CommandId.Help,
      CommandId.Login,
      CommandId.Model
    ]);
    expect(store.get(highlightedCommandAtom)?.id).toBe(CommandId.Clear);
    expect(store.get(commandMenuDesiredRowsAtom)).toBe(COMMAND_MENU_PANEL_ROWS);
  });

  it('narrows matches as the query grows', () => {
    const store = createStore();
    setText(store, '/cl');

    expect(store.get(commandMenuMatchesAtom).map((command) => command.id)).toEqual([
      CommandId.Clear
    ]);
    expect(store.get(highlightedCommandAtom)?.id).toBe(CommandId.Clear);
  });

  it('stays open with no matches and keeps the fixed panel height', () => {
    const store = createStore();
    setText(store, '/zzz');

    expect(store.get(commandMenuOpenAtom)).toBe(true);
    expect(store.get(commandMenuMatchesAtom)).toEqual([]);
    expect(store.get(highlightedCommandAtom)).toBeUndefined();
    expect(store.get(commandMenuDesiredRowsAtom)).toBe(COMMAND_MENU_PANEL_ROWS);
  });

  it('is closed for non-slash text', () => {
    const store = createStore();
    setText(store, 'hello');

    expect(store.get(commandMenuOpenAtom)).toBe(false);
    expect(store.get(commandMenuDesiredRowsAtom)).toBe(0);
  });

  it('is closed while input is locked or after Esc-dismiss', () => {
    const store = createStore();
    setText(store, '/');

    store.set(startupStatusHintAtom, BACKEND_LOADING_HINT);
    expect(store.get(commandMenuOpenAtom)).toBe(false);

    store.set(startupStatusHintAtom, undefined);
    store.set(commandMenuDismissedAtom, true);
    expect(store.get(commandMenuOpenAtom)).toBe(false);
  });

  it('clamps highlight movement to the match range', () => {
    const store = createStore();
    setText(store, '/');

    store.set(moveCommandHighlightAtom, 1);
    expect(store.get(commandMenuHighlightIndexAtom)).toBe(1);

    store.set(moveCommandHighlightAtom, 5);
    expect(store.get(commandMenuHighlightIndexAtom)).toBe(4);

    store.set(moveCommandHighlightAtom, -10);
    expect(store.get(commandMenuHighlightIndexAtom)).toBe(0);
  });

  it('clamps the highlighted command when the match set shrinks', () => {
    const store = createStore();
    setText(store, '/');
    store.set(commandMenuHighlightIndexAtom, 2);

    setText(store, '/cl');
    expect(store.get(highlightedCommandAtom)?.id).toBe(CommandId.Clear);

    store.set(resetCommandHighlightAtom);
    expect(store.get(commandMenuHighlightIndexAtom)).toBe(0);
  });
});
