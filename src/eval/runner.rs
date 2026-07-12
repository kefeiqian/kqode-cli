//! Eval pipeline orchestration.
//!
//! [`run_benchmark`] is the testable core: given already-loaded tasks and
//! injected model + grader seams, it drives the chosen subset, writes an
//! all-task `samples.jsonl`, grades it, and writes file-truth artifacts. The
//! real Docker/one-shot seams live in [`real`] and are wired at the CLI entry.

use std::collections::HashSet;
use std::fs;
use std::path::Path;
use std::time::Instant;

use super::artifacts::{PerTaskResult, RunConfig, RunSummary, run_id, write_run};
use super::{EvalBenchmark, EvalError, Grader, Task, metrics};

pub mod real;

/// One model completion plus its token usage.
pub struct DriveOutput {
    /// The raw completion text (may contain markdown fences; the grader sanitizes).
    pub solution: String,
    /// Prompt tokens reported by the provider.
    pub input_tokens: u64,
    /// Completion tokens reported by the provider.
    pub output_tokens: u64,
}

/// Drives one benchmark prompt to a completion. Injected so tests never hit a
/// provider.
pub trait ModelDriver {
    /// Completes `prompt`.
    ///
    /// # Errors
    ///
    /// Returns an [`EvalError`] when the model call fails; the runner records the
    /// task as errored and continues.
    fn drive(&self, prompt: &str) -> Result<DriveOutput, EvalError>;
}

/// Loads every task for a benchmark. Injected so tests avoid Docker.
pub trait TaskLoader {
    /// Returns all tasks for `benchmark` (the full set — `--limit` applies to
    /// driving, not loading, because the grader needs every task id present).
    ///
    /// # Errors
    ///
    /// Returns an [`EvalError`] when the tasks cannot be loaded.
    fn load(&self, benchmark: EvalBenchmark) -> Result<Vec<Task>, EvalError>;
}

/// Reproducibility fields shared across a run, minus the per-benchmark name.
#[derive(Clone, Debug)]
pub struct RunConfigBase {
    /// Short git commit of the KQode build.
    pub kqode_commit: Option<String>,
    /// Provider id.
    pub provider: String,
    /// Model id.
    pub model: String,
    /// Sampling temperature.
    pub temperature: Option<f32>,
    /// Sampling seed.
    pub seed: Option<u64>,
    /// Pinned grader image digest.
    pub grader_image_digest: Option<String>,
    /// System-prompt mode driving the model.
    pub prompt_mode: String,
}

impl RunConfigBase {
    fn to_config(&self, benchmark: EvalBenchmark) -> RunConfig {
        RunConfig {
            kqode_commit: self.kqode_commit.clone(),
            provider: self.provider.clone(),
            model: self.model.clone(),
            temperature: self.temperature,
            seed: self.seed,
            benchmark: benchmark.as_str().to_owned(),
            grader_image_digest: self.grader_image_digest.clone(),
            prompt_mode: self.prompt_mode.clone(),
        }
    }
}

/// Wraps a raw task stub in a completion instruction. Chat models emit a fenced
/// code block, which the grader's `sanitize` step extracts.
#[must_use]
pub fn build_prompt(task_prompt: &str) -> String {
    format!(
        "Complete the following Python function. Reply with the full function \
         (imports, signature, body) in a single ```python code block and nothing else.\n\n{task_prompt}"
    )
}

/// Runs one benchmark end-to-end into `base_dir/<run-id>/` and returns the
/// summary. Drives the first `limit` tasks (all when `None`); every task id is
/// written to `samples.jsonl` so the grader's full-coverage assertion holds.
///
/// # Errors
///
/// Returns an [`EvalError`] when samples cannot be written, grading fails, or
/// artifacts cannot be persisted. A single task's drive failure is recorded as
/// errored and does not abort the run.
pub fn run_benchmark(
    benchmark: EvalBenchmark,
    all_tasks: &[Task],
    limit: Option<usize>,
    driver: &dyn ModelDriver,
    grader: &dyn Grader,
    base_dir: &Path,
    config: &RunConfigBase,
) -> Result<RunSummary, EvalError> {
    let run = run_id();
    let run_dir = base_dir.join(&run);
    fs::create_dir_all(&run_dir)
        .map_err(|error| EvalError::Io(format!("creating {}: {error}", run_dir.display())))?;

    let driven_count = limit.unwrap_or(all_tasks.len()).min(all_tasks.len());
    let start = Instant::now();

    let mut samples = String::new();
    let mut driven_ids = Vec::new();
    let mut errored: HashSet<String> = HashSet::new();
    let mut input_tokens = 0u64;
    let mut output_tokens = 0u64;

    for (index, task) in all_tasks.iter().enumerate() {
        let solution = if index < driven_count {
            driven_ids.push(task.id.clone());
            match driver.drive(&build_prompt(&task.prompt)) {
                Ok(output) => {
                    input_tokens += output.input_tokens;
                    output_tokens += output.output_tokens;
                    output.solution
                }
                Err(error) => {
                    // Record and continue: one transient failure must not abort
                    // a long run or corrupt the pass-rate denominator. Surface
                    // the reason so an operator can see systemic failures.
                    eprintln!("  task {} errored: {error}", task.id);
                    errored.insert(task.id.clone());
                    String::new()
                }
            }
        } else {
            String::new()
        };
        samples.push_str(&sample_line(&task.id, &solution));
    }

    // LF newlines for the Linux Python reader (never CRLF).
    fs::write(run_dir.join("samples.jsonl"), samples.as_bytes())
        .map_err(|error| EvalError::Io(format!("writing samples: {error}")))?;

    let report = grader.grade(benchmark, &run_dir, "samples.jsonl")?;
    let runtime = start.elapsed().as_secs_f64();
    let computed = metrics::compute(
        &driven_ids,
        &errored,
        &report,
        runtime,
        input_tokens,
        output_tokens,
    );

    let per_task: Vec<PerTaskResult> = driven_ids
        .iter()
        .map(|id| {
            let outcome = report.get(id);
            PerTaskResult {
                task_id: id.clone(),
                errored: errored.contains(id),
                base_passed: outcome.is_some_and(|result| result.base_passed),
                plus_passed: outcome.is_some_and(|result| result.plus_passed),
            }
        })
        .collect();

    let summary = RunSummary {
        run_id: run,
        config: config.to_config(benchmark),
        metrics: computed,
    };
    write_run(&run_dir, &summary, &per_task)?;
    Ok(summary)
}

fn sample_line(task_id: &str, solution: &str) -> String {
    format!(
        "{}\n",
        serde_json::json!({ "task_id": task_id, "solution": solution })
    )
}

#[cfg(test)]
mod tests;
