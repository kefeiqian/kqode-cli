use serde::{Deserialize, Serialize};
use std::fmt;

/// JSON-RPC method returning provider status rows.
/// Mirrored in `tui/src/contracts/backend/providerMessages.ts`.
pub const PROVIDER_LIST_METHOD: &str = "kqode.provider.list";

/// JSON-RPC method returning the persisted active provider/model selection.
/// Mirrored in `tui/src/contracts/backend/providerMessages.ts`.
pub const SELECTION_GET_METHOD: &str = "kqode.selection.get";

/// JSON-RPC method storing the active provider/model selection.
/// Mirrored in `tui/src/contracts/backend/providerMessages.ts`.
pub const SELECTION_SET_METHOD: &str = "kqode.selection.set";

/// JSON-RPC method clearing a provider key.
/// Mirrored in `tui/src/contracts/backend/providerMessages.ts`.
pub const PROVIDER_CLEAR_KEY_METHOD: &str = "kqode.provider.clearKey";

/// JSON-RPC method validating and storing a provider key.
/// Mirrored in `tui/src/contracts/backend/providerMessages.ts`.
pub const PROVIDER_SET_KEY_METHOD: &str = "kqode.provider.setKey";

/// JSON-RPC method loading a provider's model catalog.
/// Mirrored in `tui/src/contracts/backend/providerMessages.ts`.
pub const PROVIDER_MODELS_METHOD: &str = "kqode.provider.models";

/// Provider status when a credential is resolvable.
pub const PROVIDER_STATUS_CONNECTED: &str = "connected";

/// Provider status when no credential is resolvable.
pub const PROVIDER_STATUS_NOT_CONFIGURED: &str = "notConfigured";

/// Credential source value for an OS-keychain key.
pub const CREDENTIAL_SOURCE_KEYCHAIN: &str = "keychain";

/// Credential source value for a workspace environment key.
pub const CREDENTIAL_SOURCE_ENV: &str = "env";

/// `kqode.provider.setKey` outcome for a validated provider.
pub const SET_KEY_OUTCOME_CONNECTED: &str = "connected";
/// `kqode.provider.setKey` outcome for a rejected credential.
pub const SET_KEY_OUTCOME_AUTH_FAILED: &str = "authFailed";
/// `kqode.provider.setKey` outcome for provider-side rate limiting.
pub const SET_KEY_OUTCOME_RATE_LIMITED: &str = "rateLimited";
/// `kqode.provider.setKey` outcome for network/DNS/TLS/timeout failures.
pub const SET_KEY_OUTCOME_UNREACHABLE: &str = "unreachable";
/// `kqode.provider.setKey` outcome for non-compatible model catalogs.
pub const SET_KEY_OUTCOME_NOT_COMPATIBLE: &str = "notCompatible";
/// `kqode.provider.setKey` outcome for compatible but empty model catalogs.
pub const SET_KEY_OUTCOME_EMPTY_CATALOG: &str = "emptyCatalog";
/// `kqode.provider.setKey` outcome for persistence/keychain failures.
pub const SET_KEY_OUTCOME_STORE_FAILED: &str = "storeFailed";

/// `kqode.provider.models` status for a loaded non-empty model catalog.
pub const MODEL_LIST_STATUS_LOADED: &str = "loaded";
/// `kqode.provider.models` status for a compatible empty model catalog.
pub const MODEL_LIST_STATUS_EMPTY: &str = "empty";
/// `kqode.provider.models` status for unavailable or invalid catalogs.
pub const MODEL_LIST_STATUS_FAILED: &str = "failed";

/// One provider row returned by `kqode.provider.list`.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderStatusInfo {
    pub provider_id: String,
    pub label: String,
    pub base_url: Option<String>,
    pub status: &'static str,
    pub credential_source: Option<&'static str>,
}

/// Result for `kqode.provider.list`.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderListResult {
    /// Whether SQLite-backed settings and selections can be persisted.
    pub persistence_available: bool,
    /// Provider status rows for the current workspace.
    pub providers: Vec<ProviderStatusInfo>,
}

/// Result for `kqode.selection.get`.
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActiveSelectionResult {
    pub provider_id: Option<String>,
    pub model_id: Option<String>,
}

/// Params for `kqode.selection.set`.
#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct SelectionSetParams {
    pub provider_id: String,
    pub model_id: String,
}

/// Result for `kqode.selection.set`.
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SelectionSetResult {
    pub ok: bool,
}

/// Params for `kqode.provider.clearKey`.
#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct ClearKeyParams {
    pub provider_id: String,
}

/// Result for `kqode.provider.clearKey`.
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClearKeyResult {
    pub ok: bool,
}

/// Params for `kqode.provider.setKey`.
///
/// Deliberately **not** `Serialize`: it is inbound-only (deserialized from the
/// request) and carries the raw key, so it must never be serializable into a
/// log/trace. The manual `Debug` below redacts `api_key`.
#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct SetKeyParams {
    pub provider_id: String,
    pub base_url: Option<String>,
    pub api_key: String,
    pub label: Option<String>,
}

impl fmt::Debug for SetKeyParams {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("SetKeyParams")
            .field("provider_id", &self.provider_id)
            .field("base_url", &self.base_url)
            .field("api_key", &"<redacted>")
            .field("label", &self.label)
            .finish()
    }
}

/// Result for `kqode.provider.setKey`.
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SetKeyResult {
    pub outcome: &'static str,
    pub selected_model: Option<String>,
}

/// Params for `kqode.provider.models`.
#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct ModelListParams {
    pub provider_id: String,
}

/// One sanitized model row in `kqode.provider.models`.
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelInfoWire {
    pub id: String,
    pub owned_by: Option<String>,
}

/// Result for `kqode.provider.models`.
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelListResult {
    pub status: &'static str,
    pub models: Vec<ModelInfoWire>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::protocol::RpcMethod;

    #[test]
    fn rpc_method_resolves_provider_methods() {
        for method in [
            RpcMethod::ProviderList,
            RpcMethod::SelectionGet,
            RpcMethod::SelectionSet,
            RpcMethod::ProviderClearKey,
            RpcMethod::ProviderSetKey,
            RpcMethod::ProviderModels,
        ] {
            assert_eq!(RpcMethod::from_method(method.as_str()), Some(method));
        }
    }

    #[test]
    fn provider_list_result_uses_camel_case_persistence_flag() {
        let result = ProviderListResult {
            persistence_available: false,
            providers: Vec::new(),
        };
        assert_eq!(
            serde_json::to_value(&result).unwrap(),
            serde_json::json!({"persistenceAvailable":false,"providers":[]})
        );
    }

    #[test]
    fn selection_set_params_reject_unknown_fields_and_use_camel_case() {
        let params: SelectionSetParams =
            serde_json::from_str(r#"{"providerId":"kimi","modelId":"kimi-k2.7-code"}"#).unwrap();
        assert_eq!(params.provider_id, "kimi");
        assert_eq!(
            serde_json::to_value(&params).unwrap(),
            serde_json::json!({"providerId":"kimi","modelId":"kimi-k2.7-code"})
        );
        assert!(
            serde_json::from_str::<SelectionSetParams>(
                r#"{"providerId":"kimi","modelId":"m","extra":true}"#
            )
            .is_err()
        );
    }

    #[test]
    fn clear_key_params_reject_unknown_fields_and_use_camel_case() {
        let params: ClearKeyParams = serde_json::from_str(r#"{"providerId":"custom"}"#).unwrap();
        assert_eq!(params.provider_id, "custom");
        assert_eq!(
            serde_json::to_value(&params).unwrap(),
            serde_json::json!({"providerId":"custom"})
        );
        assert!(
            serde_json::from_str::<ClearKeyParams>(r#"{"providerId":"custom","extra":true}"#)
                .is_err()
        );
    }

    #[test]
    fn set_key_params_redact_api_key_in_debug_and_use_camel_case() {
        let params: SetKeyParams = serde_json::from_str(
            r#"{"providerId":"custom","baseUrl":"https://example.test/v1","apiKey":"sk-secret","label":null}"#,
        )
        .unwrap();
        // camelCase wire keys deserialize into the expected fields.
        assert_eq!(params.provider_id, "custom");
        assert_eq!(params.base_url.as_deref(), Some("https://example.test/v1"));
        assert_eq!(params.api_key, "sk-secret");
        // The secret is never rendered by Debug (and the struct is not Serialize).
        assert!(!format!("{params:?}").contains("sk-secret"));
        assert!(
            serde_json::from_str::<SetKeyParams>(
                r#"{"providerId":"custom","baseUrl":null,"apiKey":"sk","label":null,"extra":true}"#
            )
            .is_err()
        );
    }

    #[test]
    fn model_list_params_reject_unknown_fields_and_use_camel_case() {
        let params: ModelListParams = serde_json::from_str(r#"{"providerId":"kimi"}"#).unwrap();
        assert_eq!(params.provider_id, "kimi");
        assert_eq!(
            serde_json::to_value(&params).unwrap(),
            serde_json::json!({"providerId":"kimi"})
        );
        assert!(
            serde_json::from_str::<ModelListParams>(r#"{"providerId":"kimi","extra":true}"#)
                .is_err()
        );
    }
}
