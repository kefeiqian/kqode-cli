import { createStore } from 'jotai';
import { describe, expect, it } from 'vitest';
import { COMMAND_MENU_PANEL_ROWS, MIN_ROWS } from '@constants/ui.ts';
import { BODY_CWD_GAP_ROWS, DEFAULT_COMPOSER_ROWS, HEADER_ROWS } from '@libs/tui/layout.ts';
import { composerStateAtom } from '@state/ui/composer/index.ts';
import { columnsTestOverrideAtom, rowsTestOverrideAtom } from '@state/ui/dimensions.ts';
import {
  bottomSpacerRowsAtom,
  commandMenuRowsAtom,
  composerTopAtom,
  layoutAtom
} from '@state/ui/index.ts';

type Store = ReturnType<typeof createStore>;

const setText = (store: Store, text: string): void => {
  store.set(composerStateAtom, { text, cursorIndex: text.length, validationError: null });
};

const pinViewport = (store: Store, columns: number, rows: number): void => {
  store.set(columnsTestOverrideAtom, columns);
  store.set(rowsTestOverrideAtom, rows);
};

describe('command menu layout atoms', () => {
  it('reserves the fixed panel height when there is room above the composer', () => {
    const store = createStore();
    pinViewport(store, 80, 24);
    setText(store, '/');

    expect(store.get(commandMenuRowsAtom)).toBe(COMMAND_MENU_PANEL_ROWS);
  });

  it('collapses the cwd row while the menu is open without moving the composer', () => {
    const store = createStore();
    pinViewport(store, 80, 24);

    setText(store, '');
    const closedComposerTop = store.get(composerTopAtom);
    expect(store.get(layoutAtom).cwdRows).toBeGreaterThanOrEqual(1);

    setText(store, '/');
    expect(store.get(layoutAtom).cwdRows).toBe(0);
    expect(store.get(composerTopAtom)).toBe(closedComposerTop);
  });

  it('keeps composerTop invariant whether the menu is open or closed', () => {
    const store = createStore();
    pinViewport(store, 80, 24);

    setText(store, '');
    const closedTop = store.get(composerTopAtom);
    setText(store, '/');

    expect(store.get(composerTopAtom)).toBe(closedTop);
    expect(store.get(composerTopAtom)).toBe(24 - 1 - DEFAULT_COMPOSER_ROWS);
  });

  it('keeps total rendered rows within the canvas at MIN_ROWS with the menu open', () => {
    const store = createStore();
    pinViewport(store, 80, MIN_ROWS);
    setText(store, '/');

    const layout = store.get(layoutAtom);
    const menuRows = store.get(commandMenuRowsAtom);
    const spacer = store.get(bottomSpacerRowsAtom);
    const total =
      HEADER_ROWS +
      layout.bodyRows +
      spacer +
      BODY_CWD_GAP_ROWS +
      layout.cwdRows +
      menuRows +
      DEFAULT_COMPOSER_ROWS +
      1;

    expect(total).toBeLessThanOrEqual(MIN_ROWS);
    expect(layout.bodyRows).toBeGreaterThanOrEqual(1);
    expect(menuRows).toBeGreaterThanOrEqual(0);
  });
});
