use std::path::Path;

use github_copilot_sdk::mode::ClientMode;
use github_copilot_sdk::types::{SessionConfig, SystemMessageConfig};
use github_copilot_sdk::{ClientOptions, IndexMap};

use crate::inference::{ChatMode, SYSTEM_PROMPT};

pub(super) fn client_options(state_directory: &Path) -> ClientOptions {
    ClientOptions::new()
        .with_mode(ClientMode::Empty)
        .with_base_directory(state_directory)
        .with_use_logged_in_user(true)
        .with_enable_remote_sessions(false)
}

pub(super) fn session_config(model: &str, mode: ChatMode) -> SessionConfig {
    SessionConfig::default()
        .with_model(model)
        .with_client_name("KQode")
        .with_streaming(mode == ChatMode::Streaming)
        .with_system_message(
            SystemMessageConfig::new()
                .with_mode("replace")
                .with_content(SYSTEM_PROMPT),
        )
        .with_tools(Vec::new())
        .with_available_tools(Vec::<String>::new())
        .with_mcp_servers(IndexMap::new())
        .with_request_canvas_renderer(false)
        .with_request_extensions(false)
        .with_enable_config_discovery(false)
        .with_skip_embedding_retrieval(true)
        .with_enable_on_demand_instruction_discovery(false)
        .with_enable_file_hooks(false)
        .with_enable_host_git_operations(false)
        .with_enable_session_store(false)
        .with_enable_skills(false)
        .with_enable_mcp_apps(false)
        .with_skill_directories(Vec::<std::path::PathBuf>::new())
        .with_instruction_directories(Vec::<std::path::PathBuf>::new())
        .with_plugin_directories(Vec::<std::path::PathBuf>::new())
}

#[cfg(test)]
mod tests {
    use super::session_config;
    use crate::inference::{ChatMode, SYSTEM_PROMPT};

    #[test]
    fn replaces_the_system_message_and_disables_ambient_capabilities() {
        let config = session_config("test-model", ChatMode::Streaming);
        let system_message = config.system_message.unwrap();

        assert_eq!(config.model.as_deref(), Some("test-model"));
        assert_eq!(config.streaming, Some(true));
        assert_eq!(system_message.mode.as_deref(), Some("replace"));
        assert_eq!(system_message.content.as_deref(), Some(SYSTEM_PROMPT));
        assert_eq!(config.enable_config_discovery, Some(false));
        assert_eq!(config.enable_skills, Some(false));
        assert_eq!(config.enable_file_hooks, Some(false));
        assert_eq!(config.enable_host_git_operations, Some(false));
        assert_eq!(config.enable_session_store, Some(false));
        assert!(config.tools.as_ref().is_some_and(Vec::is_empty));
        assert_eq!(config.available_tools, Some(Vec::new()));
        assert!(config.mcp_servers.unwrap().is_empty());
        assert!(config.plugin_directories.unwrap().is_empty());
    }
}
