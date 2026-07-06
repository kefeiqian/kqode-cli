import type {
  ActiveSelectionResult,
  ModelInfoWire,
  ModelListResult,
  ProviderStatusInfo
} from '@contracts/backend/providerMessages.ts';
import { PROVIDER_STATUS_CONNECTED } from '@contracts/backend/providerMessages.ts';
import { sanitizeModelId } from '@libs/providers/sanitizeModelId.ts';
import { appendProviderSourceTag } from '@libs/providers/statusLabel.ts';

/** Input pair for a provider and its fetched model-list result. */
export type ProviderModelsInput = {
  provider: ProviderStatusInfo;
  modelList: ModelListResult;
};

/** Model row data annotated with provider identity and active status. */
export type GroupedModel = ModelInfoWire & {
  providerId: string;
  isActive: boolean;
};

/** Provider-level grouping used by the `/model` surface. */
export type ProviderModelGroup = {
  providerId: string;
  label: string;
  status: ProviderStatusInfo['status'];
  listStatus: ModelListResult['status'];
  models: GroupedModel[];
};

/** Stable flattened pager row identity for provider headers and model rows. */
export type ProviderModelRow =
  | { type: 'provider'; providerId: string; label: string }
  | { type: 'model'; providerId: string; modelId: string; model: GroupedModel };

/** Groups provider model lists and marks the active provider/model identity. */
export function groupProviderModels(
  inputs: readonly ProviderModelsInput[],
  active: ActiveSelectionResult
): ProviderModelGroup[] {
  return inputs.map(({ provider, modelList }) => ({
    providerId: provider.providerId,
    label:
      provider.status === PROVIDER_STATUS_CONNECTED
        ? appendProviderSourceTag(provider.label, provider.credentialSource)
        : provider.label,
    status: provider.status,
    listStatus: modelList.status,
    models: modelList.models.map((model) => {
      const id = sanitizeModelId(model.id);
      return {
        id,
        ownedBy: model.ownedBy === null ? null : sanitizeModelId(model.ownedBy),
        providerId: provider.providerId,
        isActive: active.providerId === provider.providerId && active.modelId === id
      };
    })
  }));
}

/** Flattens grouped models into stable provider/model rows for pager windowing. */
export function flattenProviderModelRows(groups: readonly ProviderModelGroup[]): ProviderModelRow[] {
  return groups.flatMap((group) => [
    { type: 'provider' as const, providerId: group.providerId, label: group.label },
    ...group.models.map((model) => ({
      type: 'model' as const,
      providerId: group.providerId,
      modelId: model.id,
      model
    }))
  ]);
}

/** Returns the visible row window for an offset and visible-count pager. */
export function windowProviderModelRows(
  rows: readonly ProviderModelRow[],
  offset: number,
  visibleCount: number
): ProviderModelRow[] {
  const start = Math.max(0, Math.min(offset, rows.length));
  const count = Math.max(0, visibleCount);
  return rows.slice(start, start + count);
}
