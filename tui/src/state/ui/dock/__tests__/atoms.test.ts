import { describe, expect, it } from 'vitest';
import { createStore } from 'jotai';
import { DOCKED_PANEL_ROWS } from '@constants/ui.ts';
import { resolveDockedPanelRows } from '@libs/tui/layout.ts';
import { activeDockedPanelAtom, DockedPanel, dockedPanelRowsAtom } from '@state/ui/dock/atoms.ts';
import { columnsTestOverrideAtom, rowsTestOverrideAtom } from '@state/ui/dimensions.ts';
import { resumePanelOpenAtom } from '@state/ui/resume/index.ts';
import { activeSurfaceAtom, Surface } from '@state/ui/surface/index.ts';

describe('activeDockedPanelAtom', () => {
  it('is null when nothing is docked', () => {
    const store = createStore();
    expect(store.get(activeDockedPanelAtom)).toBeNull();
  });

  it('reports the resume panel while it is open', () => {
    const store = createStore();
    store.set(resumePanelOpenAtom, true);
    expect(store.get(activeDockedPanelAtom)).toBe(DockedPanel.Resume);
  });

  it('is null while a full-screen surface (e.g. Help) is active and resume is closed', () => {
    const store = createStore();
    store.set(activeSurfaceAtom, Surface.Help);
    expect(store.get(activeDockedPanelAtom)).toBeNull();
  });
});

describe('dockedPanelRowsAtom', () => {
  it('caps the open resume panel to half the terminal', () => {
    const store = createStore();
    store.set(columnsTestOverrideAtom, 80);
    store.set(rowsTestOverrideAtom, 24);
    store.set(resumePanelOpenAtom, true);
    expect(store.get(dockedPanelRowsAtom)).toBe(
      resolveDockedPanelRows({ rows: 24, desiredRows: DOCKED_PANEL_ROWS })
    );
  });

  it('gives every docked surface the same constant height so switching never jumps', () => {
    const resumeStore = createStore();
    resumeStore.set(rowsTestOverrideAtom, 24);
    resumeStore.set(resumePanelOpenAtom, true);

    const themeStore = createStore();
    themeStore.set(rowsTestOverrideAtom, 24);
    themeStore.set(activeSurfaceAtom, Surface.Theme);

    expect(themeStore.get(dockedPanelRowsAtom)).toBe(resumeStore.get(dockedPanelRowsAtom));
  });

  it('reserves no rows when nothing is docked', () => {
    const store = createStore();
    store.set(rowsTestOverrideAtom, 24);
    expect(store.get(dockedPanelRowsAtom)).toBe(0);
  });
});
