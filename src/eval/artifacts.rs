//! File-truth run artifacts under `~/.kqode/eval/<run-id>/`.
//!
//! Every run writes a `summary.json` (machine), `summary.md` (human), and a
//! per-task `results.jsonl`, each via atomic temp-write + rename. The provider
//! API key is never a field here and never reaches an artifact.

use std::fs;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use time::OffsetDateTime;

use super::EvalError;
use super::metrics::Metrics;

/// Reproducibility-bearing configuration recorded with every run. Deliberately
/// carries **no** credential field.
#[derive(Clone, Debug, Serialize)]
pub struct RunConfig {
    /// Short git commit of the KQode build, when resolvable.
    pub kqode_commit: Option<String>,
    /// Provider id the run drove.
    pub provider: String,
    /// Model id the run drove.
    pub model: String,
    /// Sampling temperature (pinned for eval).
    pub temperature: Option<f32>,
    /// Sampling seed, when honored.
    pub seed: Option<u64>,
    /// KQode-facing benchmark name (e.g. `humaneval+`).
    pub benchmark: String,
    /// Pinned grader image digest (`ganler/evalplus@sha256:...`), when known.
    pub grader_image_digest: Option<String>,
    /// System-prompt mode driving the model (e.g. `eval` / `as-shipped`).
    pub prompt_mode: String,
}

/// One task's persisted outcome.
#[derive(Clone, Debug, Serialize)]
pub struct PerTaskResult {
    /// EvalPlus task id.
    pub task_id: String,
    /// The model drive failed (no completion produced).
    pub errored: bool,
    /// Passed the base suite.
    pub base_passed: bool,
    /// Passed the augmented suite.
    pub plus_passed: bool,
}

/// The machine-readable run summary written as `summary.json`.
#[derive(Clone, Debug, Serialize)]
pub struct RunSummary {
    /// Unique, time-ordered run id (also the directory name).
    pub run_id: String,
    /// Reproducibility configuration.
    pub config: RunConfig,
    /// Aggregate metrics.
    pub metrics: Metrics,
}

/// Generates a time-ordered run id: `YYYYMMDDTHHMMSS-<hex>`. The timestamp prefix
/// keeps run directories sorted; the suffix disambiguates same-second runs.
#[must_use]
pub fn run_id() -> String {
    let now = OffsetDateTime::now_utc();
    let suffix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.subsec_nanos())
        .unwrap_or(0);
    format!(
        "{:04}{:02}{:02}T{:02}{:02}{:02}-{:06x}",
        now.year(),
        u8::from(now.month()),
        now.day(),
        now.hour(),
        now.minute(),
        now.second(),
        suffix & 0xff_ffff,
    )
}

/// Writes all run artifacts into `run_dir`, creating it if needed.
///
/// # Errors
///
/// Returns [`EvalError::Io`] when the directory or any artifact cannot be
/// written.
pub fn write_run(
    run_dir: &Path,
    summary: &RunSummary,
    per_task: &[PerTaskResult],
) -> Result<(), EvalError> {
    fs::create_dir_all(run_dir)
        .map_err(|error| EvalError::Io(format!("creating {}: {error}", run_dir.display())))?;

    let json = serde_json::to_string_pretty(summary)
        .map_err(|error| EvalError::Io(format!("encoding summary: {error}")))?;
    atomic_write(&run_dir.join("summary.json"), json.as_bytes())?;

    atomic_write(
        &run_dir.join("summary.md"),
        render_markdown(summary).as_bytes(),
    )?;

    let mut jsonl = String::new();
    for result in per_task {
        let line = serde_json::to_string(result)
            .map_err(|error| EvalError::Io(format!("encoding result: {error}")))?;
        jsonl.push_str(&line);
        jsonl.push('\n');
    }
    atomic_write(&run_dir.join("results.jsonl"), jsonl.as_bytes())?;
    Ok(())
}

/// Writes `bytes` to `path` atomically: a sibling temp file then a rename, so a
/// crash mid-write never leaves a partial artifact.
fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), EvalError> {
    let temp = path.with_extension("tmp");
    fs::write(&temp, bytes)
        .map_err(|error| EvalError::Io(format!("writing {}: {error}", temp.display())))?;
    fs::rename(&temp, path)
        .map_err(|error| EvalError::Io(format!("renaming into {}: {error}", path.display())))?;
    Ok(())
}

/// Renders the portfolio-facing Markdown summary.
fn render_markdown(summary: &RunSummary) -> String {
    let metrics = &summary.metrics;
    let config = &summary.config;
    format!(
        "# Eval run {run_id}\n\n\
         - Benchmark: {benchmark}\n\
         - Provider / model: {provider} / {model}\n\
         - Prompt mode: {prompt_mode}\n\
         - KQode commit: {commit}\n\
         - Grader image: {image}\n\n\
         ## Results\n\n\
         - pass@1 (plus): {pass:.3}\n\
         - pass@1 (base): {base:.3}\n\
         - tasks: {succeeded}/{attempted} passed ({total} driven, {errored} errored)\n\
         - tokens: {input} in / {output} out\n\
         - runtime: {runtime:.1}s\n",
        run_id = summary.run_id,
        benchmark = config.benchmark,
        provider = config.provider,
        model = config.model,
        prompt_mode = config.prompt_mode,
        commit = config.kqode_commit.as_deref().unwrap_or("unknown"),
        image = config.grader_image_digest.as_deref().unwrap_or("unpinned"),
        pass = metrics.pass_rate,
        base = metrics.base_pass_rate,
        succeeded = metrics.tasks_succeeded,
        attempted = metrics.tasks_attempted,
        total = metrics.tasks_total,
        errored = metrics.tasks_errored,
        input = metrics.input_tokens,
        output = metrics.output_tokens,
        runtime = metrics.runtime_seconds,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn summary() -> RunSummary {
        RunSummary {
            run_id: run_id(),
            config: RunConfig {
                kqode_commit: Some("abc1234".to_owned()),
                provider: "kimi".to_owned(),
                model: "kimi-k2.7-code".to_owned(),
                temperature: Some(0.0),
                seed: Some(7),
                benchmark: "humaneval+".to_owned(),
                grader_image_digest: Some("ganler/evalplus@sha256:26b1".to_owned()),
                prompt_mode: "eval".to_owned(),
            },
            metrics: Metrics {
                pass_rate: 0.5,
                tasks_total: 2,
                tasks_attempted: 2,
                tasks_succeeded: 1,
                ..Metrics::default()
            },
        }
    }

    #[test]
    fn run_id_is_time_prefixed_and_unique() {
        let first = run_id();
        assert!(first.contains('T') && first.contains('-'));
        assert_eq!(first.len(), "20260712T134500-0a1b2c".len());
    }

    #[test]
    fn write_run_produces_all_artifacts_without_the_key() {
        let dir = tempfile::tempdir().unwrap();
        let run_dir = dir.path().join("run");
        let per_task = vec![PerTaskResult {
            task_id: "HumanEval/0".to_owned(),
            errored: false,
            base_passed: true,
            plus_passed: true,
        }];
        write_run(&run_dir, &summary(), &per_task).unwrap();

        for name in ["summary.json", "summary.md", "results.jsonl"] {
            assert!(run_dir.join(name).exists(), "missing {name}");
        }
        // No credential ever reaches an artifact.
        for name in ["summary.json", "summary.md", "results.jsonl"] {
            let body = fs::read_to_string(run_dir.join(name)).unwrap();
            assert!(
                !body.to_lowercase().contains("api_key"),
                "{name} leaked api_key"
            );
        }
        // summary.json round-trips the recorded config.
        let json = fs::read_to_string(run_dir.join("summary.json")).unwrap();
        assert!(json.contains("\"benchmark\": \"humaneval+\""));
        assert!(json.contains("\"model\": \"kimi-k2.7-code\""));
    }
}
