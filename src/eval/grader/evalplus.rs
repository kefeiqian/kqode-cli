//! Real EvalPlus grader: sanitizes and grades a samples file inside the
//! container-only isolation defined by `evaluation/compose.yaml`.

use std::path::{Path, PathBuf};
use std::process::Command;

use super::{GradeReport, Grader, parse_eval_results};
use crate::eval::{EvalBenchmark, EvalError};

/// Grades via `docker compose run` against the pinned EvalPlus image.
///
/// Model-written code is untrusted, so all execution happens in the container
/// with the isolation properties encoded in the compose file (network off,
/// read-only root, dropped caps, non-root, resource limits). The grader process
/// receives no provider credentials.
pub struct EvalPlusGrader {
    compose_file: PathBuf,
    image: Option<String>,
}

impl EvalPlusGrader {
    /// Builds a grader bound to a compose file and an optional image override
    /// (e.g. a pinned `ganler/evalplus@sha256:...` digest).
    #[must_use]
    pub fn new(compose_file: PathBuf, image: Option<String>) -> Self {
        Self {
            compose_file,
            image,
        }
    }

    /// Runs one `docker compose run --rm grader <args>` with the run dir mounted.
    fn run_compose(&self, run_dir: &Path, args: &[&str]) -> Result<(), EvalError> {
        let mut command = Command::new("docker");
        command
            .arg("compose")
            .arg("-f")
            .arg(&self.compose_file)
            .args(["run", "--rm", "grader"])
            .args(args)
            // The compose file mounts EVAL_RUN_DIR at /work and reads EVALPLUS_IMAGE.
            .env("EVAL_RUN_DIR", run_dir);
        if let Some(image) = &self.image {
            command.env("EVALPLUS_IMAGE", image);
        }
        let output = command
            .output()
            .map_err(|error| EvalError::Process(format!("spawning docker failed: {error}")))?;
        if !output.status.success() {
            let stderr = scrub(&String::from_utf8_lossy(&output.stderr));
            return Err(EvalError::Process(format!(
                "grader step {args:?} failed: {stderr}"
            )));
        }
        Ok(())
    }
}

impl Grader for EvalPlusGrader {
    fn grade(
        &self,
        benchmark: EvalBenchmark,
        run_dir: &Path,
        samples_file: &str,
    ) -> Result<GradeReport, EvalError> {
        let sanitized = with_suffix(samples_file, "-sanitized.jsonl");
        // 1. Strip the model's markdown fences into gradeable code.
        self.run_compose(
            run_dir,
            &[
                "evalplus.sanitize",
                "--samples",
                &container_path(samples_file),
            ],
        )?;
        // 2. Grade the sanitized solutions offline against the augmented tests.
        self.run_compose(
            run_dir,
            &[
                "evalplus.evaluate",
                "--dataset",
                benchmark.dataset(),
                "--samples",
                &container_path(&sanitized),
            ],
        )?;
        // 3. Parse the results EvalPlus wrote next to the sanitized samples.
        let results_name = with_suffix(&sanitized, "_eval_results.json");
        let results_path = run_dir.join(&results_name);
        let json = std::fs::read_to_string(&results_path).map_err(|error| {
            EvalError::Io(format!("reading {}: {error}", results_path.display()))
        })?;
        parse_eval_results(&json)
    }
}

/// Replaces the trailing `.jsonl` of `name` with `suffix`.
fn with_suffix(name: &str, suffix: &str) -> String {
    let stem = name.strip_suffix(".jsonl").unwrap_or(name);
    format!("{stem}{suffix}")
}

/// The container-visible path for a file in the mounted run dir.
fn container_path(name: &str) -> String {
    format!("/work/{name}")
}

/// Strips control and ANSI escape bytes from untrusted grader output before it
/// reaches a diagnostic, so it cannot spoof logs or manipulate the terminal.
fn scrub(text: &str) -> String {
    text.chars()
        .filter(|character| *character == '\n' || *character == '\t' || !character.is_control())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn with_suffix_swaps_the_jsonl_extension() {
        assert_eq!(
            with_suffix("samples.jsonl", "-sanitized.jsonl"),
            "samples-sanitized.jsonl"
        );
        assert_eq!(
            with_suffix("samples-sanitized.jsonl", "_eval_results.json"),
            "samples-sanitized_eval_results.json"
        );
    }

    #[test]
    fn scrub_removes_ansi_and_control_bytes() {
        let dirty = "ok\u{1b}[31mred\u{07}\u{0}\ndone";
        let clean = scrub(dirty);
        assert!(!clean.contains('\u{1b}'));
        assert!(!clean.contains('\u{07}'));
        assert!(clean.contains("done"));
        assert!(clean.contains('\n'));
    }

    // Real grading, opt-in: set KQODE_EVAL_IT_RUNDIR to a dir holding a full
    // `samples.jsonl` (all task ids) and run with `--ignored`. Needs Docker.
    #[test]
    #[ignore = "requires Docker + a populated run dir (KQODE_EVAL_IT_RUNDIR)"]
    fn grades_a_real_run_dir() {
        let Some(run_dir) = std::env::var_os("KQODE_EVAL_IT_RUNDIR") else {
            return;
        };
        let compose = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("evaluation/compose.yaml");
        let grader = EvalPlusGrader::new(compose, None);
        let report = grader
            .grade(
                EvalBenchmark::HumanEvalPlus,
                Path::new(&run_dir),
                "samples.jsonl",
            )
            .expect("real grading succeeds");
        assert!(report.len() >= 160, "expected the full HumanEval+ set");
    }
}
