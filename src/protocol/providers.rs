use serde::{Deserialize, Serialize};

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

/// Provider status when a credential is resolvable.
pub const PROVIDER_STATUS_CONNECTED: &str = "connected";

/// Provider status when no credential is resolvable.
pub const PROVIDER_STATUS_NOT_CONFIGURED: &str = "notConfigured";

/// Credential source value for an OS-keychain key.
pub const CREDENTIAL_SOURCE_KEYCHAIN: &str = "keychain";

/// Credential source value for a workspace environment key.
pub const CREDENTIAL_SOURCE_ENV: &str = "env";

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
        ] {
            assert_eq!(RpcMethod::from_method(method.as_str()), Some(method));
        }
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
}
