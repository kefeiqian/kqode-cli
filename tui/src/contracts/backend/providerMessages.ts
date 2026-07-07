/**
 * Dependency-free wire contract for provider/model backend requests.
 *
 * Must not import transport, `@backend`, or `@state` modules.
 */

/** Must match `PROVIDER_LIST_METHOD` in `src/protocol.rs`. */
export const PROVIDER_LIST_METHOD = 'kqode.provider.list';

/** Must match `SELECTION_GET_METHOD` in `src/protocol.rs`. */
export const SELECTION_GET_METHOD = 'kqode.selection.get';

/** Must match `SELECTION_SET_METHOD` in `src/protocol.rs`. */
export const SELECTION_SET_METHOD = 'kqode.selection.set';

/** Must match `PROVIDER_CLEAR_KEY_METHOD` in `src/protocol.rs`. */
export const PROVIDER_CLEAR_KEY_METHOD = 'kqode.provider.clearKey';

/** Must match `PROVIDER_SET_KEY_METHOD` in `src/protocol.rs`. */
export const PROVIDER_SET_KEY_METHOD = 'kqode.provider.setKey';

/** Must match `PROVIDER_MODELS_METHOD` in `src/protocol.rs`. */
export const PROVIDER_MODELS_METHOD = 'kqode.provider.models';

/** Must match `PROVIDER_STATUS_CONNECTED` in `src/protocol.rs`. */
export const PROVIDER_STATUS_CONNECTED = 'connected';

/** Must match `PROVIDER_STATUS_NOT_CONFIGURED` in `src/protocol.rs`. */
export const PROVIDER_STATUS_NOT_CONFIGURED = 'notConfigured';

/** Must match `CREDENTIAL_SOURCE_KEYCHAIN` in `src/protocol.rs`. */
export const CREDENTIAL_SOURCE_KEYCHAIN = 'keychain';

/** Must match `CREDENTIAL_SOURCE_ENV` in `src/protocol.rs`. */
export const CREDENTIAL_SOURCE_ENV = 'env';

/** Must match `SET_KEY_OUTCOME_CONNECTED` in `src/protocol.rs`. */
export const SET_KEY_OUTCOME_CONNECTED = 'connected';

/** Must match `SET_KEY_OUTCOME_AUTH_FAILED` in `src/protocol.rs`. */
export const SET_KEY_OUTCOME_AUTH_FAILED = 'authFailed';

/** Must match `SET_KEY_OUTCOME_RATE_LIMITED` in `src/protocol.rs`. */
export const SET_KEY_OUTCOME_RATE_LIMITED = 'rateLimited';

/** Must match `SET_KEY_OUTCOME_UNREACHABLE` in `src/protocol.rs`. */
export const SET_KEY_OUTCOME_UNREACHABLE = 'unreachable';

/** Must match `SET_KEY_OUTCOME_NOT_COMPATIBLE` in `src/protocol.rs`. */
export const SET_KEY_OUTCOME_NOT_COMPATIBLE = 'notCompatible';

/** Must match `SET_KEY_OUTCOME_EMPTY_CATALOG` in `src/protocol.rs`. */
export const SET_KEY_OUTCOME_EMPTY_CATALOG = 'emptyCatalog';

/** Must match `SET_KEY_OUTCOME_STORE_FAILED` in `src/protocol.rs`. */
export const SET_KEY_OUTCOME_STORE_FAILED = 'storeFailed';

/** Must match `MODEL_LIST_STATUS_LOADED` in `src/protocol.rs`. */
export const MODEL_LIST_STATUS_LOADED = 'loaded';

/** Must match `MODEL_LIST_STATUS_EMPTY` in `src/protocol.rs`. */
export const MODEL_LIST_STATUS_EMPTY = 'empty';

/** Must match `MODEL_LIST_STATUS_FAILED` in `src/protocol.rs`. */
export const MODEL_LIST_STATUS_FAILED = 'failed';

export type ProviderStatus = typeof PROVIDER_STATUS_CONNECTED | typeof PROVIDER_STATUS_NOT_CONFIGURED;

export type CredentialSource = typeof CREDENTIAL_SOURCE_KEYCHAIN | typeof CREDENTIAL_SOURCE_ENV;

export type SetKeyOutcome =
  | typeof SET_KEY_OUTCOME_CONNECTED
  | typeof SET_KEY_OUTCOME_AUTH_FAILED
  | typeof SET_KEY_OUTCOME_RATE_LIMITED
  | typeof SET_KEY_OUTCOME_UNREACHABLE
  | typeof SET_KEY_OUTCOME_NOT_COMPATIBLE
  | typeof SET_KEY_OUTCOME_EMPTY_CATALOG
  | typeof SET_KEY_OUTCOME_STORE_FAILED;

export type ModelListStatus =
  | typeof MODEL_LIST_STATUS_LOADED
  | typeof MODEL_LIST_STATUS_EMPTY
  | typeof MODEL_LIST_STATUS_FAILED;

/** Must match `ProviderStatusInfo` in `src/protocol.rs`. */
export type ProviderStatusInfo = {
  providerId: string;
  label: string;
  baseUrl: string | null;
  defaultModel: string | null;
  status: ProviderStatus;
  credentialSource: CredentialSource | null;
};

/** Must match `ProviderListResult` in `src/protocol.rs`. */
export type ProviderListResult = {
  providers: ProviderStatusInfo[];
};

/** Must match `ActiveSelectionResult` in `src/protocol.rs`. */
export type ActiveSelectionResult = {
  providerId: string | null;
  modelId: string | null;
};

/** Must match `SelectionSetParams` in `src/protocol.rs`. */
export type SelectionSetParams = {
  providerId: string;
  modelId: string;
};

/** Must match `SelectionSetResult` in `src/protocol.rs`. */
export type SelectionSetResult = {
  ok: boolean;
};

/** Must match `ClearKeyParams` in `src/protocol.rs`. */
export type ClearKeyParams = {
  providerId: string;
};

/** Must match `ClearKeyResult` in `src/protocol.rs`. */
export type ClearKeyResult = {
  ok: boolean;
};

/** Must match `SetKeyParams` in `src/protocol.rs`. */
export type SetKeyParams = {
  providerId: string;
  baseUrl: string | null;
  apiKey: string;
  label: string | null;
};

/** Must match `SetKeyResult` in `src/protocol.rs`. */
export type SetKeyResult = {
  outcome: SetKeyOutcome;
  selectedModel: string | null;
};

/** Must match `ModelListParams` in `src/protocol.rs`. */
export type ModelListParams = {
  providerId: string;
};

/** Must match `ModelInfoWire` in `src/protocol.rs`. */
export type ModelInfoWire = {
  id: string;
  ownedBy: string | null;
};

/** Must match `ModelListResult` in `src/protocol.rs`. */
export type ModelListResult = {
  status: ModelListStatus;
  models: ModelInfoWire[];
};
