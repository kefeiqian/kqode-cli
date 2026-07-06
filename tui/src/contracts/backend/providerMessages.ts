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

/** Must match `PROVIDER_STATUS_CONNECTED` in `src/protocol.rs`. */
export const PROVIDER_STATUS_CONNECTED = 'connected';

/** Must match `PROVIDER_STATUS_NOT_CONFIGURED` in `src/protocol.rs`. */
export const PROVIDER_STATUS_NOT_CONFIGURED = 'notConfigured';

/** Must match `CREDENTIAL_SOURCE_KEYCHAIN` in `src/protocol.rs`. */
export const CREDENTIAL_SOURCE_KEYCHAIN = 'keychain';

/** Must match `CREDENTIAL_SOURCE_ENV` in `src/protocol.rs`. */
export const CREDENTIAL_SOURCE_ENV = 'env';

export type ProviderStatus = typeof PROVIDER_STATUS_CONNECTED | typeof PROVIDER_STATUS_NOT_CONFIGURED;

export type CredentialSource = typeof CREDENTIAL_SOURCE_KEYCHAIN | typeof CREDENTIAL_SOURCE_ENV;

/** Must match `ProviderStatusInfo` in `src/protocol.rs`. */
export type ProviderStatusInfo = {
  providerId: string;
  label: string;
  baseUrl: string | null;
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
