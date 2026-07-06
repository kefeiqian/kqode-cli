import { RequestType, RequestType0 } from 'vscode-jsonrpc';
import {
  PROVIDER_CLEAR_KEY_METHOD,
  PROVIDER_LIST_METHOD,
  SELECTION_GET_METHOD,
  SELECTION_SET_METHOD
} from '@contracts/backend/index.ts';
import type {
  ActiveSelectionResult,
  ClearKeyParams,
  ClearKeyResult,
  ProviderListResult,
  SelectionSetParams,
  SelectionSetResult
} from '@contracts/backend/index.ts';

/** Typed descriptor for the parameterless `kqode.provider.list` request. */
export const providerListRequest = new RequestType0<ProviderListResult, void>(
  PROVIDER_LIST_METHOD
);

/** Typed descriptor for the parameterless `kqode.selection.get` request. */
export const selectionGetRequest = new RequestType0<ActiveSelectionResult, void>(
  SELECTION_GET_METHOD
);

/** Typed descriptor for the `kqode.selection.set` request. */
export const selectionSetRequest = new RequestType<SelectionSetParams, SelectionSetResult, void>(
  SELECTION_SET_METHOD
);

/** Typed descriptor for the `kqode.provider.clearKey` request. */
export const providerClearKeyRequest = new RequestType<ClearKeyParams, ClearKeyResult, void>(
  PROVIDER_CLEAR_KEY_METHOD
);
