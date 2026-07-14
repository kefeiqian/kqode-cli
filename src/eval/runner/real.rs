//! Real (Docker + provider) implementations of the runner seams.
//!
//! These are assembled at the CLI entry and exercised via `#[ignore]` tests and
//! manual runs; the runner core stays generic over the traits so ordinary unit
//! tests never spawn Docker or call a provider.

use std::path::PathBuf;
use std::process::Command;

use super::{DriveOutput, ModelDriver, TaskLoader};
use crate::chat::run_oneshot;
use crate::chat::system_prompt::eval_system_message;
use crate::config::KimiConfig;
use crate::eval::benchmark::parse_tasks_jsonl;
use crate::eval::{EvalBenchmark, EvalError, Task};
use crate::provider::Sampling;

/// Loads task prompts by running the prompt-dump adapter inside the pinned image
/// (datasets baked in, so it runs with the network disabled).
pub struct DockerTaskLoader {
    image: String,
    adapter: PathBuf,
}

impl DockerTaskLoader {
    /// Binds a loader to a grader image and the host path of the adapter script.
    #[must_use]
    pub fn new(image: String, adapter: PathBuf) -> Self {
        Self { image, adapter }
    }
}

impl TaskLoader for DockerTaskLoader {
    fn load(&self, benchmark: EvalBenchmark) -> Result<Vec<Task>, EvalError> {
        let mount = format!("{}:/adapter.py:ro", self.adapter.display());
        let output = Command::new("docker")
            .args(["run", "--rm", "--network", "none"])
            .args(["-e", "HOME=/root", "-v", &mount, &self.image])
            .args(["python", "/adapter.py", "--dataset", benchmark.dataset()])
            .output()
            .map_err(|error| EvalError::Process(format!("spawning docker failed: {error}")))?;
        if !output.status.success() {
            return Err(EvalError::Process(format!(
                "task loader failed: {}",
                String::from_utf8_lossy(&output.stderr)
            )));
        }
        parse_tasks_jsonl(&String::from_utf8_lossy(&output.stdout))
    }
}

/// Drives the model through the shared one-shot core with the env-noise-free
/// eval system prompt and pinned sampling.
pub struct OneshotModelDriver {
    config: KimiConfig,
    sampling: Sampling,
}

impl OneshotModelDriver {
    /// Binds a driver to a resolved provider config and sampling settings.
    #[must_use]
    pub fn new(config: KimiConfig, sampling: Sampling) -> Self {
        Self { config, sampling }
    }
}

impl ModelDriver for OneshotModelDriver {
    fn drive(&self, prompt: &str) -> Result<DriveOutput, EvalError> {
        let completion = run_oneshot(
            self.config.clone(),
            eval_system_message(),
            None,
            prompt,
            self.sampling,
        )
        .map_err(|error| EvalError::Process(format!("model drive failed: {error}")))?;
        let (input_tokens, output_tokens) = completion.usage.map_or((0, 0), |usage| {
            (u64::from(usage.input), u64::from(usage.output))
        });
        Ok(DriveOutput {
            solution: completion.text,
            input_tokens,
            output_tokens,
        })
    }
}
