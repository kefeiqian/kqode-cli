import os from 'node:os';
import path from 'node:path';
import { createStore } from 'jotai';
import { App } from '@/App.tsx';
import { BodyEntryKind } from '@constants/bodyEntry.ts';
import {
  productVersionAtom,
  workspaceCwdAtom
} from '@state/global/index.ts';
import {
  bodyEntriesAtom,
  columnsTestOverrideAtom,
  rowsTestOverrideAtom
} from '@state/ui/index.ts';
import { renderWithJotai } from '@test/renderWithJotai.tsx';

export function renderSelectionScreen() {
  const store = createStore();
  store.set(productVersionAtom, '0.2.0');
  store.set(workspaceCwdAtom, path.join(os.homedir(), 'Projects', 'KQode'));
  store.set(columnsTestOverrideAtom, 80);
  store.set(rowsTestOverrideAtom, 16);
  store.set(bodyEntriesAtom, [
    { kind: BodyEntryKind.Assistant, text: 'selectable transcript line' }
  ]);

  return { store, ...renderWithJotai(<App />, store) };
}
