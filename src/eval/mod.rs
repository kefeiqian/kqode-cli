//! Public no-tool benchmark evaluation runner.
//!
//! Drives KQode against public benchmarks (first vertical: EvalPlus
//! HumanEval+/MBPP+), grades the results in an isolated container, and writes
//! reproducible file-truth run reports under [`crate::paths::eval_dir`]. See
//! `docs/plans/2026-07-12-004-feat-evaluation-baseline-benchmarks-plan.md`.
//!
//! The runner core is generic over injected model + grader seams so unit tests
//! stay hermetic; the real EvalPlus grader shells out to Docker and is exercised
//! only in `#[ignore]`-gated integration tests.

use std::error::Error;
use std::fmt;

pub mod benchmark;
pub mod grader;

pub use benchmark::{EvalBenchmark, Task};
pub use grader::{GradeReport, Grader, TaskResult, parse_eval_results};

/// Errors surfaced by the eval subsystem.
#[derive(Debug)]
pub enum EvalError {
    /// A benchmark name or selection string was not recognized.
    UnknownBenchmark(String),
    /// Parsing JSONL (task prompts or grader results) failed.
    Parse(String),
    /// A filesystem operation on run artifacts failed.
    Io(String),
    /// An external process (Docker / grader / adapter) failed.
    Process(String),
    /// No provider is configured, so the run cannot proceed.
    NoProvider,
}

impl fmt::Display for EvalError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::UnknownBenchmark(name) => write!(formatter, "unknown benchmark `{name}`"),
            Self::Parse(message) => write!(formatter, "eval parse error: {message}"),
            Self::Io(message) => write!(formatter, "eval io error: {message}"),
            Self::Process(message) => write!(formatter, "eval process error: {message}"),
            Self::NoProvider => formatter.write_str("no provider configured for eval"),
        }
    }
}

impl Error for EvalError {}

/// Encodes an arbitrary benchmark task id into a single safe path component.
///
/// EvalPlus task ids contain `/` (`HumanEval/0`, `Mbpp/2`), and untrusted input
/// could contain `..` or separators. Only ASCII alphanumerics and `-` survive;
/// every other byte (including `/`, `\`, and `.`) becomes `_`, so the result can
/// never traverse or escape a directory. Never derive a path from model output.
#[must_use]
pub fn safe_filename(task_id: &str) -> String {
    let encoded: String = task_id
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || character == '-' {
                character
            } else {
                '_'
            }
        })
        .collect();
    if encoded.is_empty() {
        "_".to_owned()
    } else {
        encoded
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn safe_filename_neutralizes_separators_and_traversal() {
        assert_eq!(safe_filename("HumanEval/0"), "HumanEval_0");
        assert_eq!(safe_filename("Mbpp/2"), "Mbpp_2");
        // No traversal survives: dots and separators all collapse to `_`.
        assert_eq!(safe_filename("../etc/passwd"), "___etc_passwd");
        assert_eq!(safe_filename(".."), "__");
        assert!(!safe_filename("a/b/c").contains('/'));
    }

    #[test]
    fn safe_filename_never_empty() {
        assert_eq!(safe_filename(""), "_");
        assert_eq!(safe_filename("///"), "___");
    }
}
