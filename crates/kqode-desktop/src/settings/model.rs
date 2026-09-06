use serde::{Deserialize, Serialize};

use super::Provider;
use super::credentials::serialize_empty_api_key;

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmSettings {
    pub provider: Provider,
    pub api_base_url: String,
    #[serde(default, serialize_with = "serialize_empty_api_key")]
    pub api_key: String,
    #[serde(default)]
    pub api_key_preview: String,
    #[serde(default)]
    pub highlighted_models: Vec<String>,
    pub model: String,
}

impl Default for LlmSettings {
    fn default() -> Self {
        Self::for_provider(Provider::Kimi)
    }
}

impl LlmSettings {
    pub fn for_provider(provider: Provider) -> Self {
        Self {
            provider,
            api_base_url: provider.default_api_base_url().to_owned(),
            api_key: String::new(),
            api_key_preview: String::new(),
            highlighted_models: Vec::new(),
            model: String::new(),
        }
    }
}
