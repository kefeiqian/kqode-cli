import { createStore } from 'jotai';
import { describe, expect, it } from 'vitest';
import { COMMAND_MENU_PANEL_ROWS, MIN_ROWS, RESUME_PANEL_ROWS } from '@constants/ui.ts';
import { BodyEntryKind } from '@constants/bodyEntry.ts';
import {
  BODY_CWD_GAP_ROWS,
  DEFAULT_COMPOSER_ROWS,
  HEADER_ROWS,
  resolveDockedPanelRows
} from '@libs/tui/layout.ts';
import { composerStateAtom } from '@state/ui/composer/index.ts';
import { columnsTestOverrideAtom, rowsTestOverrideAtom } from '@state/ui/dimensions.ts';
import {
  bottomSpacerRowsAtom,
  commandMenuRowsAtom,
  composerTopAtom,
  homeHeaderRowsAtom,
  layoutAtom,
  resumePanelRowsAtom
} from '@state/ui/index.ts';
import { openResumePanelAtom } from '@state/ui/resume/index.ts';
import { bodyEntriesAtom } from '@state/ui/body.ts';

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

    expect(store.get(commandMenuRowsAtom)).toBe(COMMAND_MENU_PANEL_ROWS + 1);
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
    const headerRows = store.get(homeHeaderRowsAtom);
    const total =
      headerRows +
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

describe('resume panel layout atoms', () => {
  it('budgets the docked panel above the body with composer, cwd, and status collapsed', () => {
    const store = createStore();
    pinViewport(store, 80, 24);
    store.set(
      bodyEntriesAtom,
      Array.from({ length: 24 }, (_, index) => ({
        id: `row-${index}`,
        kind: BodyEntryKind.System,
        text: `body row ${index}`
      }))
    );

    store.set(openResumePanelAtom);

    const layout = store.get(layoutAtom);
    const panelRows = resolveDockedPanelRows({ rows: 24, desiredRows: RESUME_PANEL_ROWS });
    const headerRows = store.get(homeHeaderRowsAtom);
    expect(panelRows).toBe(12); // 14 desired, capped to half of a 24-row terminal
    expect(store.get(resumePanelRowsAtom)).toBe(panelRows);
    expect(layout.bodyRows).toBe(24 - headerRows - panelRows);
    expect(layout.cwdRows).toBe(0);
    expect(store.get(bottomSpacerRowsAtom)).toBe(0);
    // Caret guard: the row arithmetic that positions the composer caret sums to the canvas.
    expect(headerRows + layout.bodyRows + panelRows).toBe(24);
  });

  it('clamps the panel on short terminals so one body row remains', () => {
    const store = createStore();
    pinViewport(store, 80, MIN_ROWS);

    store.set(openResumePanelAtom);

    const layout = store.get(layoutAtom);
    const total =
      HEADER_ROWS + layout.bodyRows + store.get(bottomSpacerRowsAtom) + store.get(resumePanelRowsAtom);
    expect(total).toBeLessThanOrEqual(MIN_ROWS);
    expect(layout.bodyRows).toBeGreaterThanOrEqual(1);
  });
});
