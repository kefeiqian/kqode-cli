use std::path::PathBuf;

use github_copilot_sdk::Client;
use uuid::Uuid;

use crate::inference::ChatError;

use super::config;

const STOP_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(10);

pub async fn verify_packaged_runtime(require_authentication: bool) -> Result<(), ChatError> {
    if !github_copilot_sdk::HAS_BUNDLED_CLI {
        return Err(ChatError::Configuration(
            "GitHub Copilot SDK runtime is not embedded in this build".to_owned(),
        ));
    }

    let cli_path = github_copilot_sdk::install_bundled_cli()
        .ok_or_else(|| ChatError::Configuration("extract bundled GitHub Copilot CLI".to_owned()))?;
    verify_non_empty_file(&cli_path, "GitHub Copilot CLI")?;

    let runtime_path = github_copilot_sdk::install_bundled_runtime().ok_or_else(|| {
        ChatError::Configuration("extract bundled GitHub Copilot SDK runtime".to_owned())
    })?;
    verify_non_empty_file(&runtime_path, "GitHub Copilot SDK runtime")?;
    let runtime_node = runtime_path.with_file_name("runtime.node");
    verify_non_empty_file(&runtime_node, "GitHub Copilot SDK runtime.node")?;

    let runtime = CopilotSdkRuntime::start().await?;
    runtime
        .client
        .ping(Some("kqode-packaged-runtime"))
        .await
        .map_err(|error| {
            ChatError::Request(format!("ping packaged GitHub Copilot SDK runtime: {error}"))
        })?;
    if require_authentication {
        let models = runtime.client.list_models().await.map_err(|error| {
            ChatError::Request(format!(
                "list Copilot models with packaged GitHub authentication: {error}"
            ))
        })?;
        if models.is_empty() {
            return Err(ChatError::Request(
                "packaged GitHub Copilot SDK returned no models".to_owned(),
            ));
        }
    }
    runtime.stop().await
}

fn verify_non_empty_file(path: &std::path::Path, label: &str) -> Result<(), ChatError> {
    let metadata = std::fs::metadata(path).map_err(|error| {
        ChatError::Configuration(format!(
            "inspect extracted {label} at {}: {error}",
            path.display()
        ))
    })?;
    if !metadata.is_file() || metadata.len() == 0 {
        return Err(ChatError::Configuration(format!(
            "extracted {label} is not a non-empty file: {}",
            path.display()
        )));
    }
    Ok(())
}

pub(super) struct CopilotSdkRuntime {
    pub(super) client: Client,
    state_directory: StateDirectory,
    stopped: bool,
}

impl CopilotSdkRuntime {
    pub(super) async fn start() -> Result<Self, ChatError> {
        let state_directory = StateDirectory::create(
            std::env::temp_dir()
                .join("kqode-copilot-sdk")
                .join(Uuid::new_v4().to_string()),
        )?;
        let client = Client::start(config::client_options(state_directory.path()))
            .await
            .map_err(|error| {
                ChatError::Configuration(format!("start GitHub Copilot SDK runtime: {error}"))
            })?;
        Ok(Self {
            client,
            state_directory,
            stopped: false,
        })
    }

    pub(super) async fn stop(mut self) -> Result<(), ChatError> {
        let stop_result = match tokio::time::timeout(STOP_TIMEOUT, self.client.stop()).await {
            Ok(Ok(())) => {
                self.stopped = true;
                Ok(())
            }
            Ok(Err(error)) => {
                self.client.force_stop();
                self.stopped = true;
                Err(ChatError::Request(format!(
                    "stop GitHub Copilot SDK runtime: {error}"
                )))
            }
            Err(_) => {
                self.client.force_stop();
                self.stopped = true;
                Err(ChatError::Request(
                    "stop GitHub Copilot SDK runtime timed out".to_owned(),
                ))
            }
        };
        let remove_result = self.state_directory.remove();
        combine_cleanup(stop_result, remove_result)
    }
}

impl Drop for CopilotSdkRuntime {
    fn drop(&mut self) {
        if !self.stopped {
            self.client.force_stop();
        }
    }
}

struct StateDirectory {
    path: PathBuf,
    removed: bool,
}

impl StateDirectory {
    fn create(path: PathBuf) -> Result<Self, ChatError> {
        std::fs::create_dir_all(&path).map_err(|error| {
            ChatError::Configuration(format!(
                "create GitHub Copilot SDK state directory: {error}"
            ))
        })?;
        Ok(Self {
            path,
            removed: false,
        })
    }

    fn path(&self) -> &std::path::Path {
        &self.path
    }

    fn remove(&mut self) -> Result<(), ChatError> {
        if !self.path.exists() {
            self.removed = true;
            return Ok(());
        }
        std::fs::remove_dir_all(&self.path).map_err(|error| {
            ChatError::Request(format!(
                "remove GitHub Copilot SDK state directory {}: {error}",
                self.path.display()
            ))
        })?;
        self.removed = true;
        Ok(())
    }
}

impl Drop for StateDirectory {
    fn drop(&mut self) {
        if !self.removed {
            let _ = std::fs::remove_dir_all(&self.path);
        }
    }
}

fn combine_cleanup(
    result: Result<(), ChatError>,
    cleanup: Result<(), ChatError>,
) -> Result<(), ChatError> {
    match (result, cleanup) {
        (Ok(()), Ok(())) => Ok(()),
        (Ok(()), Err(error)) | (Err(error), Ok(())) => Err(error),
        (Err(error), Err(cleanup)) => Err(ChatError::Request(format!(
            "{error}; cleanup also failed: {cleanup}"
        ))),
    }
}

#[cfg(test)]
mod tests {
    use super::combine_cleanup;
    use crate::inference::ChatError;

    #[test]
    fn preserves_runtime_and_directory_cleanup_failures() {
        let result = combine_cleanup(
            Err(ChatError::Request("runtime stop failed".to_owned())),
            Err(ChatError::Request("directory cleanup failed".to_owned())),
        );

        assert_eq!(
            result.unwrap_err().to_string(),
            "runtime stop failed; cleanup also failed: directory cleanup failed"
        );
    }
}
