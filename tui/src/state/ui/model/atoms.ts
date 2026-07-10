import { atom } from 'jotai';
import type { Getter, Setter } from 'jotai';
import { MODEL_LIST_STATUS_LOADED } from '@contracts/backend/providerMessages.ts';
import type {
  ActiveSelectionResult,
  ProviderStatusInfo
} from '@contracts/backend/providerMessages.ts';
import type { SetKeyOutcome } from '@contracts/backend/providerMessages.ts';
import {
  flattenProviderModelRows,
  groupProviderModels,
  windowProviderModelRows
} from '@libs/providers/index.ts';
import type { ProviderModelGroup, ProviderModelRow } from '@libs/providers/index.ts';
import { clamp } from '@libs/math/clamp.ts';
import { MODEL_DOCK_CHROME_ROWS, INLINE_CONNECT_ROWS, MODEL_LOAD_STATUS_LOADING } from '@state/ui/model/constants.ts';
import type { ModelLoadStatus, ProviderModelLoad } from '@state/ui/model/providerLoads.ts';
import { identityEquals, rowIdentity, toWireList } from '@state/ui/model/rowIdentity.ts';
import {
  initialProviderModelLoads,
  isFocusableModelStatus
} from '@state/ui/model/providerLoads.ts';

/** Identity anchor for the highlighted focusable row. */
export type ModelHighlightIdentity = { providerId: string; modelId: string | null };

export type ModelSurfaceGroup = Omit<ProviderModelGroup, 'listStatus'> & { listStatus: ModelLoadStatus };

export type ModelSurfaceRow =
  | ProviderModelRow
  | { type: 'status'; providerId: string; status: Exclude<ModelLoadStatus, typeof MODEL_LIST_STATUS_LOADED> };

export const modelProvidersAtom = atom<ProviderStatusInfo[]>([]);
/** Per-provider loading/loaded/empty/failed model lists. */
export const providerModelLoadsAtom = atom<Record<string, ProviderModelLoad>>({});
export const modelActiveSelectionAtom = atom<ActiveSelectionResult>({
  providerId: null,
  modelId: null
});
export const modelHighlightAtom = atom<ModelHighlightIdentity | null>(null);
export const modelWindowOffsetAtom = atom(0);
/** Visible row budget supplied by the surface for stable window math in atoms. */
export const modelVisibleRowsAtom = atom(1);
export const inlineConnectProviderIdAtom = atom<string | null>(null);
export const inlineConnectInFlightAtom = atom(false);
export const inlineConnectOutcomeAtom = atom<SetKeyOutcome | null>(null);
export const inlineConnectRequestErrorAtom = atom<string | null>(null);
export const modelSurfaceConsumesEscAtom = atom((get) => {
  return get(inlineConnectProviderIdAtom) !== null || get(inlineConnectInFlightAtom) || get(inlineConnectOutcomeAtom) !== null;
});

/** Resets `/model` state before a fresh backend load. */
export const resetModelSurfaceAtom = atom(null, (_get, set) => {
  set(modelProvidersAtom, []);
  set(providerModelLoadsAtom, {});
  set(modelActiveSelectionAtom, { providerId: null, modelId: null });
  set(modelHighlightAtom, null);
  set(modelWindowOffsetAtom, 0);
  set(inlineConnectProviderIdAtom, null);
  set(inlineConnectInFlightAtom, false);
  set(inlineConnectOutcomeAtom, null);
  set(inlineConnectRequestErrorAtom, null);
});

/** Stores providers and marks each connected provider as loading immediately. */
export const setModelProvidersLoadingAtom = atom(null, (get, set, providers: ProviderStatusInfo[]) => {
  set(modelProvidersAtom, providers);
  set(providerModelLoadsAtom, initialProviderModelLoads(providers));
  ensureHighlight(get, set);
});

/** Stores the active selection and highlights it, or falls back to the first row. */
export const setModelActiveSelectionAtom = atom(null, (get, set, selection: ActiveSelectionResult) => {
  set(modelActiveSelectionAtom, selection);
  if (selection.providerId !== null && selection.modelId !== null) {
    set(modelHighlightAtom, { providerId: selection.providerId, modelId: selection.modelId });
    ensureHighlight(get, set);
    return;
  }
  ensureHighlight(get, set);
});

/** Replaces one provider's list while preserving the highlighted row's screen position. */
export const setProviderModelLoadAtom = atom(
  null,
  (get, set, update: { providerId: string; load: ProviderModelLoad }) => {
    const oldVisual = highlightedVisualRow(get);
    set(providerModelLoadsAtom, {
      ...get(providerModelLoadsAtom),
      [update.providerId]: update.load
    });
    ensureHighlight(get, set, oldVisual);
  }
);

/** Moves the highlight across focusable model/status rows. */
export const moveModelHighlightAtom = atom(null, (get, set, delta: number) => {
  const rows = get(modelFocusableRowsAtom);
  if (rows.length === 0) {
    return;
  }
  const current = highlightedFocusableIndex(get);
  const next = rows[clamp(current + delta, 0, rows.length - 1)];
  set(modelHighlightAtom, rowIdentity(next));
  ensureVisible(get, set, get(modelRowsAtom).findIndex((row) => identityEquals(row, rowIdentity(next))));
});

/** Windowed rows rendered by the surface. */
export const visibleModelRowsAtom = atom((get) => {
  return windowProviderModelRows(
    get(modelRowsAtom) as ProviderModelRow[],
    get(modelWindowOffsetAtom),
    get(modelVisibleRowsAtom)
  ) as ModelSurfaceRow[];
});

/** Currently highlighted full row, if visible in the flattened list. */
export const highlightedModelRowAtom = atom((get) => {
  const highlight = get(modelHighlightAtom);
  return highlight === null ? null : get(modelRowsAtom).find((row) => identityEquals(row, highlight)) ?? null;
});

export const modelGroupsAtom = atom<ModelSurfaceGroup[]>((get) => {
  const loads = get(providerModelLoadsAtom);
  const active = get(modelActiveSelectionAtom);
  return groupProviderModels(
    get(modelProvidersAtom).map((provider) => ({
      provider,
      modelList: toWireList(loads[provider.providerId])
    })),
    active
  ).map((group) => ({
    ...group,
    listStatus: loads[group.providerId]?.status ?? MODEL_LOAD_STATUS_LOADING
  }));
});

export const modelRowsAtom = atom<ModelSurfaceRow[]>((get) => {
  const groups = get(modelGroupsAtom);
  const baseRows = flattenProviderModelRows(groups as ProviderModelGroup[]);
  return baseRows.flatMap<ModelSurfaceRow>((row) => {
    if (row.type === 'model') {
      return [row];
    }
    const group = groups.find((candidate) => candidate.providerId === row.providerId);
    if (group === undefined || group.listStatus === MODEL_LIST_STATUS_LOADED) {
      return [row];
    }
    return [row, { type: 'status' as const, providerId: row.providerId, status: group.listStatus }];
  });
});

export const modelFocusableRowsAtom = atom((get) => {
  return get(modelRowsAtom).filter(
    (row) => row.type === 'model' || (row.type === 'status' && isFocusableModelStatus(row.status))
  );
});

/**
 * Content-derived desired popup height. When the inline provider-connect form is
 * active it replaces the list, so the desire is chrome + the fixed form rows;
 * otherwise it is chrome + one row per flattened provider/model row.
 */
export const modelDesiredRowsAtom = atom((get) => {
  if (get(inlineConnectProviderIdAtom) !== null) {
    return MODEL_DOCK_CHROME_ROWS + INLINE_CONNECT_ROWS;
  }
  return MODEL_DOCK_CHROME_ROWS + get(modelRowsAtom).length;
});

/**
 * Re-clamps the window so the highlighted row stays visible after the visible-row
 * budget changes (e.g. once the async model list loads and the docked cap
 * settles). Mirrors `moveModelHighlightAtom`'s window math without moving focus.
 */
export const scrollModelHighlightIntoViewAtom = atom(null, (get, set) => {
  const highlight = get(modelHighlightAtom);
  if (highlight === null) {
    return;
  }
  ensureVisible(
    get,
    set,
    get(modelRowsAtom).findIndex((row) => identityEquals(row, highlight))
  );
});

function ensureHighlight(get: Getter, set: Setter, visualRow?: number | null) {
  const rows = get(modelFocusableRowsAtom);
  const current = get(modelHighlightAtom);
  if (rows.length === 0) {
    set(modelHighlightAtom, null);
    set(modelWindowOffsetAtom, 0);
    return;
  }
  const currentVisible = current !== null && rows.some((row) => identityEquals(row, current));
  if (!currentVisible && current !== null && current.modelId !== null && isProviderLoading(get, current.providerId)) {
    return;
  }
  const next = currentVisible ? current : rowIdentity(rows[0]);
  set(modelHighlightAtom, next);
  const index = get(modelRowsAtom).findIndex((row) => identityEquals(row, next));
  const visible = get(modelVisibleRowsAtom);
  if (visualRow !== undefined && visualRow !== null && index >= 0) {
    set(modelWindowOffsetAtom, clamp(index - visualRow, 0, Math.max(0, get(modelRowsAtom).length - visible)));
  } else {
    ensureVisible(get, set, index);
  }
}

function ensureVisible(get: Getter, set: Setter, index: number) {
  if (index < 0) {
    return;
  }
  const visible = get(modelVisibleRowsAtom);
  const maxOffset = Math.max(0, get(modelRowsAtom).length - visible);
  const offset = get(modelWindowOffsetAtom);
  set(modelWindowOffsetAtom, clamp(index < offset ? index : Math.max(offset, index - visible + 1), 0, maxOffset));
}

function highlightedVisualRow(get: Getter) {
  const highlight = get(modelHighlightAtom);
  if (highlight === null) {
    return null;
  }
  const index = get(modelRowsAtom).findIndex((row) => identityEquals(row, highlight));
  return index < 0 ? null : index - get(modelWindowOffsetAtom);
}

function highlightedFocusableIndex(get: Getter) {
  const rows = get(modelFocusableRowsAtom);
  const highlight = get(modelHighlightAtom);
  const index = highlight === null ? -1 : rows.findIndex((row) => identityEquals(row, highlight));
  return index < 0 ? 0 : index;
}

function isProviderLoading(get: Getter, providerId: string) {
  return get(providerModelLoadsAtom)[providerId]?.status === MODEL_LOAD_STATUS_LOADING;
}
