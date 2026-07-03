import { createStore } from 'jotai';
import { describe, expect, it } from 'vitest';
import { headerRowCount } from '@libs/tui/layout.ts';
import { composerStateAtom } from '@state/composer/index.ts';
import { columnsTestOverrideAtom, rowsTestOverrideAtom } from '@state/global/dimensions.ts';
import {
  BODY_CWD_GAP_ROWS,
  DEFAULT_COMPOSER_ROWS,
  resolveHomeScreenLayout
} from '@state/homeScreen/layout.ts';
import {
  bottomSpacerRowsAtom,
  commandMenuRowsAtom,
  composerTopAtom,
  layoutAtom
} from '@state/homeScreen/index.ts';

type Store = ReturnType<typeof createStore>;

const setText = (store: Store, text: string): void => {
  store.set(composerStateAtom, { text, cursorIndex: text.length, validationError: null });
};

const pinViewport = (store: Store, columns: number, rows: number): void => {
  store.set(columnsTestOverrideAtom, columns);
  store.set(rowsTestOverrideAtom, rows);
};

describe('resolveHomeScreenLayout with a command menu', () => {
  it('reflows the body by the menu height when the transcript fills the pane', () => {
    const withoutMenu = resolveHomeScreenLayout(80, 24, 1000, 3, 1, 0);
    const withMenu = resolveHomeScreenLayout(80, 24, 1000, 3, 1, 3);

    expect(withMenu.bodyRows).toBe(withoutMenu.bodyRows - 3);
    expect(withMenu.bodyRows).toBeGreaterThanOrEqual(1);
  });

  it('never drops the body below one row', () => {
    const layout = resolveHomeScreenLayout(80, 12, 1000, 3, 1, 8);
    expect(layout.bodyRows).toBeGreaterThanOrEqual(1);
  });
});

describe('command menu layout atoms', () => {
  it('renders all matches when there is room above the composer', () => {
    const store = createStore();
    pinViewport(store, 80, 24);
    setText(store, '/');

    expect(store.get(commandMenuRowsAtom)).toBe(3);
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
    pinViewport(store, 80, 10);
    setText(store, '/');

    const layout = store.get(layoutAtom);
    const menuRows = store.get(commandMenuRowsAtom);
    const spacer = store.get(bottomSpacerRowsAtom);
    const total =
      headerRowCount(80) +
      layout.bodyRows +
      spacer +
      BODY_CWD_GAP_ROWS +
      layout.cwdRows +
      menuRows +
      DEFAULT_COMPOSER_ROWS +
      1;

    expect(total).toBeLessThanOrEqual(10);
    expect(layout.bodyRows).toBeGreaterThanOrEqual(1);
    expect(menuRows).toBeGreaterThanOrEqual(0);
  });
});
