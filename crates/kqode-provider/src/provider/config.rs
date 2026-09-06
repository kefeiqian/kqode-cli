use super::Provider;

/// Resolved secret-bearing configuration consumed by provider adapters.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProviderConfig {
    pub(crate) provider: Provider,
    pub(crate) api_base_url: String,
    pub(crate) api_key: String,
    pub(crate) model: String,
}

impl ProviderConfig {
    /// Creates a resolved provider configuration.
    pub fn new(provider: Provider, api_base_url: String, api_key: String, model: String) -> Self {
        Self {
            provider,
            api_base_url,
            api_key,
            model,
        }
    }
}
