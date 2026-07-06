import { MODEL_LIST_STATUS_EMPTY } from '@contracts/backend/providerMessages.ts';
import type { ModelListResult } from '@contracts/backend/providerMessages.ts';
import type { ModelHighlightIdentity, ModelSurfaceRow, ProviderModelLoad } from '@state/ui/model/atoms.ts';
import { MODEL_LOAD_STATUS_LOADING } from '@state/ui/model/constants.ts';

/** Converts local loading state into the wire statuses accepted by grouping helpers. */
export function toWireList(load: ProviderModelLoad | undefined): ModelListResult {
  if (load === undefined || load.status === MODEL_LOAD_STATUS_LOADING) {
    return { status: MODEL_LIST_STATUS_EMPTY, models: [] };
  }
  return { status: load.status, models: load.models };
}

/** Returns the stable focus identity for a focusable model/status row. */
export function rowIdentity(row: ModelSurfaceRow): ModelHighlightIdentity {
  return { providerId: row.providerId, modelId: row.type === 'model' ? row.modelId : null };
}

/** Compares a row to the identity-anchored highlight. */
export function identityEquals(row: ModelSurfaceRow, identity: ModelHighlightIdentity) {
  if (row.type === 'provider') {
    return false;
  }
  return row.providerId === identity.providerId && (row.type === 'model' ? row.modelId : null) === identity.modelId;
}
