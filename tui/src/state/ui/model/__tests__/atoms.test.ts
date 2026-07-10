import { createStore } from 'jotai';
import { describe, expect, it } from 'vitest';
import {
  MODEL_LIST_STATUS_EMPTY,
  MODEL_LIST_STATUS_FAILED,
  MODEL_LIST_STATUS_LOADED,
  PROVIDER_STATUS_CONNECTED,
  PROVIDER_STATUS_NOT_CONFIGURED
} from '@contracts/backend/providerMessages.ts';
import type { ProviderStatusInfo } from '@contracts/backend/providerMessages.ts';
import {
  INLINE_CONNECT_ROWS,
  MODEL_DOCK_CHROME_ROWS,
  inlineConnectProviderIdAtom,
  modelActiveSelectionAtom,
  modelDesiredRowsAtom,
  modelHighlightAtom,
  modelRowsAtom,
  modelVisibleRowsAtom,
  modelWindowOffsetAtom,
  MODEL_LOAD_STATUS_NOT_CONNECTED,
  moveModelHighlightAtom,
  setModelActiveSelectionAtom,
  setModelProvidersLoadingAtom,
  setProviderModelLoadAtom
} from '@state/ui/model/index.ts';

const provider = (providerId: string): ProviderStatusInfo => ({
  providerId,
  label: providerId,
  baseUrl: null,
  defaultModel: `${providerId}-default`,
  status: PROVIDER_STATUS_CONNECTED,
  credentialSource: 'keychain'
});

describe('model atoms', () => {
  it('anchors highlight by provider/model identity while late rows load above it', () => {
    const store = createStore();
    store.set(modelVisibleRowsAtom, 3);
    store.set(setModelProvidersLoadingAtom, [provider('a'), provider('b')]);
    store.set(setModelActiveSelectionAtom, { providerId: 'b', modelId: 'b2' });
    store.set(setProviderModelLoadAtom, {
      providerId: 'b',
      load: { status: MODEL_LIST_STATUS_LOADED, models: [{ id: 'b1', ownedBy: null }, { id: 'b2', ownedBy: null }] }
    });

    const before = store.get(modelHighlightAtom);
    const beforeOffset = store.get(modelWindowOffsetAtom);
    store.set(setProviderModelLoadAtom, {
      providerId: 'a',
      load: { status: MODEL_LIST_STATUS_LOADED, models: [{ id: 'a1', ownedBy: null }, { id: 'a2', ownedBy: null }] }
    });

    expect(store.get(modelHighlightAtom)).toEqual(before);
    expect(store.get(modelWindowOffsetAtom)).toBe(beforeOffset + 1);
  });

  it('moves across status rows and stores active selection', () => {
    const store = createStore();
    store.set(setModelProvidersLoadingAtom, [provider('a'), provider('b')]);
    store.set(setProviderModelLoadAtom, { providerId: 'a', load: { status: MODEL_LIST_STATUS_EMPTY, models: [] } });
    store.set(setProviderModelLoadAtom, { providerId: 'b', load: { status: MODEL_LIST_STATUS_FAILED, models: [] } });

    expect(store.get(modelHighlightAtom)).toEqual({ providerId: 'a', modelId: null });
    store.set(moveModelHighlightAtom, 1);
    expect(store.get(modelHighlightAtom)).toEqual({ providerId: 'b', modelId: null });

    store.set(setModelActiveSelectionAtom, { providerId: 'b', modelId: 'b1' });
    expect(store.get(modelActiveSelectionAtom)).toEqual({ providerId: 'b', modelId: 'b1' });
    expect(store.get(modelRowsAtom).some((row) => row.type === 'status')).toBe(true);
  });

  it('renders not-connected providers as focusable rows', () => {
    const store = createStore();
    store.set(setModelProvidersLoadingAtom, [
      provider('kimi'),
      {
        ...provider('custom'),
        defaultModel: null,
        status: PROVIDER_STATUS_NOT_CONFIGURED,
        credentialSource: null
      }
    ]);

    const rows = store.get(modelRowsAtom);
    expect(rows).toContainEqual({
      type: 'status',
      providerId: 'custom',
      status: MODEL_LOAD_STATUS_NOT_CONNECTED
    });
    store.set(moveModelHighlightAtom, 1);
    expect(store.get(modelHighlightAtom)).toEqual({ providerId: 'custom', modelId: null });
  });

  it('desires docked chrome plus one row per model row, or the inline form height', () => {
    const store = createStore();
    store.set(setModelProvidersLoadingAtom, [provider('a')]);
    store.set(setProviderModelLoadAtom, {
      providerId: 'a',
      load: {
        status: MODEL_LIST_STATUS_LOADED,
        models: [{ id: 'a1', ownedBy: null }, { id: 'a2', ownedBy: null }]
      }
    });

    expect(store.get(modelDesiredRowsAtom)).toBe(
      MODEL_DOCK_CHROME_ROWS + store.get(modelRowsAtom).length
    );

    store.set(inlineConnectProviderIdAtom, 'a');
    expect(store.get(modelDesiredRowsAtom)).toBe(MODEL_DOCK_CHROME_ROWS + INLINE_CONNECT_ROWS);
  });
});
