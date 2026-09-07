mod anthropic;
mod config;
mod copilot;
mod copilot_sdk;
mod custom;
mod deepseek;
mod identity;
mod kimi;
mod openai;
mod openai_compatible;
mod router;
mod shared;

pub use config::ProviderConfig;
pub use copilot_sdk::verify_packaged_runtime;
pub use identity::{
    ANTHROPIC_API_BASE_URL, DEEPSEEK_API_BASE_URL, KIMI_API_BASE_URL, OPENAI_API_BASE_URL, Provider,
};
pub use router::{ProviderConnectionStatus, chat, list_models, test_connection};
pub use shared::validate_base_url;

#[cfg(any(test, feature = "test-support"))]
pub mod test_support {
    pub use super::anthropic::response::parse_completion as parse_anthropic_completion;
    pub use super::copilot_sdk::tool_selection_test_support::CopilotSdkToolSelectionClient;
    pub use super::kimi::tool_selection_test_support::KimiToolSelectionClient;
    pub use super::openai_compatible::response::{parse_completion, parse_models};
}
