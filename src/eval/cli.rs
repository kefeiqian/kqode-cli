//! CLI-facing eval orchestration: parse args, resolve config, assemble the real
//! Docker/one-shot seams, and run each selected benchmark.

use std::ffi::OsString;
use std::path::PathBuf;
use std::process::Command;

use super::runner::real::{DockerTaskLoader, OneshotModelDriver};
use super::{
    DEFAULT_GRADER_IMAGE, EvalError, RunConfigBase, TaskLoader, grader::EvalPlusGrader,
    parse_selection, run_benchmark,
};
use crate::connect::resolve_submit_config;
use crate::provider::Sampling;
use crate::store::Store;

/// Parsed `kqode eval` arguments.
struct EvalArgs {
    selection: String,
    limit: Option<usize>,
    out_dir: Option<PathBuf>,
}

/// Runs `kqode eval <selection> [--limit N] [--out DIR]`.
///
/// Resolves the active provider (fail-closed), drives each selected benchmark
/// with the eval-mode prompt and pinned sampling, grades in the isolated
/// container, and writes file-truth reports.
///
/// # Errors
///
/// Returns [`EvalError::NoProvider`] when nothing is configured, or another
/// [`EvalError`] when a benchmark run fails.
pub fn run_from_args(store: &Store, args: &[OsString]) -> Result<(), EvalError> {
    let parsed = parse_args(args)?;
    let benchmarks = parse_selection(&parsed.selection)?;

    let config = resolve_submit_config(store).ok_or(EvalError::NoProvider)?;
    let provider = store.active_selection().ok().flatten().map_or_else(
        || "kimi".to_owned(),
        |selection| selection.provider.as_str().to_owned(),
    );

    // The active Kimi coding model locks sampling: it rejects both `seed` and any
    // `temperature` other than its default (HTTP 400 "only 1 is allowed for this
    // model"). So eval sends provider-default sampling — the same request shape the
    // headless `--prompt` path uses. Determinism therefore depends on the provider;
    // pass@1 is a single-sample estimate (see the variance guidance in the spec).
    // Both fields are recorded as `None` in the run config so the report is truthful.
    let sampling = Sampling {
        temperature: None,
        seed: None,
    };
    let base = RunConfigBase {
        kqode_commit: git_short_commit(),
        provider,
        model: config.model.clone(),
        temperature: sampling.temperature,
        seed: sampling.seed,
        grader_image_digest: Some(DEFAULT_GRADER_IMAGE.to_owned()),
        prompt_mode: "eval".to_owned(),
    };

    let base_dir = match parsed.out_dir {
        Some(dir) => dir,
        None => crate::paths::eval_dir()
            .ok_or_else(|| EvalError::Io("cannot resolve ~/.kqode/eval".to_owned()))?,
    };
    // Absolutize so the runner's writes and the grader's Docker bind mount resolve
    // to the same directory. Docker Compose resolves a relative mount source
    // against the compose project dir, not this process's CWD (see the grader),
    // which would otherwise diverge for a relative `--out`.
    let base_dir = std::path::absolute(&base_dir)
        .map_err(|error| EvalError::Io(format!("resolving output dir: {error}")))?;

    let repo = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let loader = DockerTaskLoader::new(
        DEFAULT_GRADER_IMAGE.to_owned(),
        repo.join("evaluation/adapters/evalplus_prompts.py"),
    );
    let grader = EvalPlusGrader::new(
        repo.join("evaluation/compose.yaml"),
        Some(DEFAULT_GRADER_IMAGE.to_owned()),
    );
    let driver = OneshotModelDriver::new(config, sampling);

    for benchmark in benchmarks {
        println!("Running {} ...", benchmark.as_str());
        let tasks = loader.load(benchmark)?;
        let summary = run_benchmark(
            benchmark,
            &tasks,
            parsed.limit,
            &driver,
            &grader,
            &base_dir,
            &base,
        )?;
        let metrics = &summary.metrics;
        println!(
            "  {}: pass@1(plus) {:.3} | {}/{} passed ({} driven, {} errored) | {} run {}",
            benchmark.as_str(),
            metrics.pass_rate,
            metrics.tasks_succeeded,
            metrics.tasks_attempted,
            metrics.tasks_total,
            metrics.tasks_errored,
            base_dir.display(),
            summary.run_id,
        );
    }
    Ok(())
}

/// Parses the selection positional plus optional `--limit` / `--out`.
fn parse_args(args: &[OsString]) -> Result<EvalArgs, EvalError> {
    let mut selection: Option<String> = None;
    let mut limit = None;
    let mut out_dir = None;
    let mut index = 0;
    while index < args.len() {
        let arg = args[index].to_string_lossy();
        match arg.as_ref() {
            "--limit" => {
                let value = args
                    .get(index + 1)
                    .ok_or_else(|| EvalError::Parse("--limit needs a value".to_owned()))?;
                limit = Some(
                    value
                        .to_string_lossy()
                        .parse::<usize>()
                        .map_err(|_| EvalError::Parse("--limit must be a number".to_owned()))?,
                );
                index += 2;
            }
            "--out" => {
                let value = args
                    .get(index + 1)
                    .ok_or_else(|| EvalError::Parse("--out needs a path".to_owned()))?;
                out_dir = Some(PathBuf::from(value));
                index += 2;
            }
            other if other.starts_with("--") => {
                return Err(EvalError::Parse(format!("unknown eval flag `{other}`")));
            }
            other => {
                if selection.is_some() {
                    return Err(EvalError::Parse(format!("unexpected argument `{other}`")));
                }
                selection = Some(other.to_owned());
                index += 1;
            }
        }
    }
    Ok(EvalArgs {
        selection: selection.ok_or_else(|| {
            EvalError::Parse("expected a benchmark selection, e.g. `evalplus`".to_owned())
        })?,
        limit,
        out_dir,
    })
}

/// Best-effort short git commit of the working tree; `None` outside a repo.
fn git_short_commit() -> Option<String> {
    let output = Command::new("git")
        .args(["rev-parse", "--short", "HEAD"])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let commit = String::from_utf8_lossy(&output.stdout).trim().to_owned();
    (!commit.is_empty()).then_some(commit)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse(args: &[&str]) -> Result<EvalArgs, EvalError> {
        parse_args(&args.iter().map(OsString::from).collect::<Vec<_>>())
    }

    #[test]
    fn parses_selection_limit_and_out() {
        let parsed = parse(&["evalplus", "--limit", "5", "--out", "reports"]).unwrap();
        assert_eq!(parsed.selection, "evalplus");
        assert_eq!(parsed.limit, Some(5));
        assert_eq!(parsed.out_dir, Some(PathBuf::from("reports")));
    }

    #[test]
    fn missing_selection_is_an_error() {
        assert!(parse(&["--limit", "2"]).is_err());
    }

    #[test]
    fn non_numeric_limit_and_unknown_flag_error() {
        assert!(parse(&["evalplus", "--limit", "lots"]).is_err());
        assert!(parse(&["evalplus", "--bogus"]).is_err());
    }
}
