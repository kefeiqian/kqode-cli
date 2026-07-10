import { describe, expect, it } from 'vitest';
import { createStore } from 'jotai';
import { activeDockedPanelAtom, DockedPanel } from '@state/ui/dock/atoms.ts';
import { resumePanelOpenAtom } from '@state/ui/resume/index.ts';

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
});
