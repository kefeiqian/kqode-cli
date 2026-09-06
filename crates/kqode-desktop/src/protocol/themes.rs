use serde::{Deserialize, Serialize};

/// JSON-RPC method returning the persisted theme id (unset when absent).
/// Mirrored in `tui/src/contracts/backend/themeMessages.ts`.
pub const THEME_GET_METHOD: &str = "kqode.theme.get";

/// JSON-RPC method storing the selected theme id.
/// Mirrored in `tui/src/contracts/backend/themeMessages.ts`.
pub const THEME_SET_METHOD: &str = "kqode.theme.set";

/// `kqode.theme.set` outcome for a persisted theme id.
pub const THEME_SET_OUTCOME_SAVED: &str = "saved";
/// `kqode.theme.set` outcome for a malformed id rejected before any write.
pub const THEME_SET_OUTCOME_INVALID: &str = "invalid";
/// `kqode.theme.set` outcome for a store write failure. The session keeps the
/// applied theme in memory; the picker shows an unsaved warning.
pub const THEME_SET_OUTCOME_STORE_FAILED: &str = "storeFailed";

/// Result for `kqode.theme.get`.
///
/// `theme_id` is `null` when no preference is stored, so the TUI uses its
/// default preset. An unknown-but-well-formed id is returned unchanged because
/// the TUI, not Rust, owns catalog resolution and fallback. Kept in lockstep
/// with the TypeScript `ThemeGetResult`.
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ThemeGetResult {
    pub theme_id: Option<String>,
}

/// Params for `kqode.theme.set`.
#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct ThemeSetParams {
    pub theme_id: String,
}

/// Result for `kqode.theme.set`: one of the fixed [`THEME_SET_OUTCOME_SAVED`] /
/// [`THEME_SET_OUTCOME_INVALID`] / [`THEME_SET_OUTCOME_STORE_FAILED`] outcomes.
///
/// Separating "saved" from execution success lets the picker render a save
/// failure inline instead of receiving an opaque transport error. Kept in
/// lockstep with the TypeScript `ThemeSetResult`.
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ThemeSetResult {
    pub outcome: &'static str,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::protocol::RpcMethod;

    #[test]
    fn rpc_method_resolves_theme_methods() {
        for method in [RpcMethod::ThemeGet, RpcMethod::ThemeSet] {
            assert_eq!(RpcMethod::from_method(method.as_str()), Some(method));
        }
    }

    #[test]
    fn theme_get_result_uses_camel_case_and_serializes_null() {
        let saved = ThemeGetResult {
            theme_id: Some("nord".to_owned()),
        };
        assert_eq!(
            serde_json::to_value(&saved).unwrap(),
            serde_json::json!({ "themeId": "nord" })
        );
        let unset = ThemeGetResult { theme_id: None };
        assert_eq!(
            serde_json::to_value(&unset).unwrap(),
            serde_json::json!({ "themeId": null })
        );
    }

    #[test]
    fn theme_set_params_reject_unknown_fields_and_use_camel_case() {
        let params: ThemeSetParams = serde_json::from_str(r#"{"themeId":"gruvbox-dark"}"#).unwrap();
        assert_eq!(params.theme_id, "gruvbox-dark");
        assert_eq!(
            serde_json::to_value(&params).unwrap(),
            serde_json::json!({ "themeId": "gruvbox-dark" })
        );
        assert!(
            serde_json::from_str::<ThemeSetParams>(r#"{"themeId":"nord","extra":true}"#).is_err()
        );
    }

    #[test]
    fn theme_set_result_uses_camel_case() {
        let result = ThemeSetResult {
            outcome: THEME_SET_OUTCOME_SAVED,
        };
        assert_eq!(
            serde_json::to_value(&result).unwrap(),
            serde_json::json!({ "outcome": "saved" })
        );
    }
}
