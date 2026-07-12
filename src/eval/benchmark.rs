//! Benchmark identity and task model for the eval runner.

use super::EvalError;

/// A supported public no-tool benchmark.
///
/// The first vertical is EvalPlus; each variant maps to the `--dataset` value
/// its official harness expects ([`EvalBenchmark::dataset`]).
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum EvalBenchmark {
    /// HumanEval+ (EvalPlus): 164 function-synthesis tasks with augmented tests.
    HumanEvalPlus,
    /// MBPP+ (EvalPlus): 378 basic-Python tasks with augmented tests.
    MbppPlus,
}

impl EvalBenchmark {
    /// Every benchmark in canonical order. `--suite general` expands to this.
    pub const ALL: [EvalBenchmark; 2] = [Self::HumanEvalPlus, Self::MbppPlus];

    /// The stable KQode-facing name (used in selection strings and reports).
    #[must_use]
    pub fn as_str(self) -> &'static str {
        match self {
            Self::HumanEvalPlus => "humaneval+",
            Self::MbppPlus => "mbpp+",
        }
    }

    /// The EvalPlus `--dataset` value this benchmark grades against.
    #[must_use]
    pub fn dataset(self) -> &'static str {
        match self {
            Self::HumanEvalPlus => "humaneval",
            Self::MbppPlus => "mbpp",
        }
    }

    /// Parses a KQode-facing benchmark name. Accepts the canonical `humaneval+`
    /// / `mbpp+` and the bare `humaneval` / `mbpp` aliases.
    #[must_use]
    pub fn from_name(name: &str) -> Option<Self> {
        match name.trim().to_ascii_lowercase().as_str() {
            "humaneval+" | "humaneval" => Some(Self::HumanEvalPlus),
            "mbpp+" | "mbpp" => Some(Self::MbppPlus),
            _ => None,
        }
    }
}

/// Parses a comma-separated selection (`evalplus`, `humaneval+,mbpp+`) or the
/// `general` suite into an ordered, de-duplicated benchmark list.
///
/// `evalplus` and `general` both expand to [`EvalBenchmark::ALL`].
///
/// # Errors
///
/// Returns [`EvalError::UnknownBenchmark`] when a token is not a known name.
pub fn parse_selection(selection: &str) -> Result<Vec<EvalBenchmark>, EvalError> {
    let selection = selection.trim();
    if selection.eq_ignore_ascii_case("evalplus") || selection.eq_ignore_ascii_case("general") {
        return Ok(EvalBenchmark::ALL.to_vec());
    }
    let mut chosen = Vec::new();
    for token in selection.split(',') {
        let token = token.trim();
        if token.is_empty() {
            continue;
        }
        let benchmark = EvalBenchmark::from_name(token)
            .ok_or_else(|| EvalError::UnknownBenchmark(token.to_owned()))?;
        if !chosen.contains(&benchmark) {
            chosen.push(benchmark);
        }
    }
    if chosen.is_empty() {
        return Err(EvalError::UnknownBenchmark(selection.to_owned()));
    }
    Ok(chosen)
}

/// One benchmark task: a stable id and the prompt the model must complete.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Task {
    /// EvalPlus task id (e.g. `HumanEval/0`). Kept verbatim in JSON values;
    /// encode with [`super::safe_filename`] before using it in a path.
    pub id: String,
    /// The function-stub-plus-docstring prompt the model completes.
    pub prompt: String,
}

/// Parses the task-prompt JSONL emitted by the prompt-dump adapter
/// (`evaluation/adapters/evalplus_prompts.py`): one `{task_id, prompt}` object
/// per non-blank line.
///
/// # Errors
///
/// Returns [`EvalError::Parse`] when a line is not a JSON object carrying string
/// `task_id` and `prompt` fields.
pub fn parse_tasks_jsonl(jsonl: &str) -> Result<Vec<Task>, EvalError> {
    let mut tasks = Vec::new();
    for (index, line) in jsonl.lines().enumerate() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let value: serde_json::Value = serde_json::from_str(line)
            .map_err(|error| EvalError::Parse(format!("task line {}: {error}", index + 1)))?;
        let id = value["task_id"]
            .as_str()
            .ok_or_else(|| EvalError::Parse(format!("task line {}: missing task_id", index + 1)))?;
        let prompt = value["prompt"]
            .as_str()
            .ok_or_else(|| EvalError::Parse(format!("task line {}: missing prompt", index + 1)))?;
        tasks.push(Task {
            id: id.to_owned(),
            prompt: prompt.to_owned(),
        });
    }
    Ok(tasks)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn benchmark_name_round_trips_and_maps_dataset() {
        assert_eq!(
            EvalBenchmark::from_name("humaneval+"),
            Some(EvalBenchmark::HumanEvalPlus)
        );
        assert_eq!(
            EvalBenchmark::from_name("MBPP"),
            Some(EvalBenchmark::MbppPlus)
        );
        assert_eq!(EvalBenchmark::HumanEvalPlus.as_str(), "humaneval+");
        assert_eq!(EvalBenchmark::HumanEvalPlus.dataset(), "humaneval");
        assert_eq!(EvalBenchmark::MbppPlus.dataset(), "mbpp");
        assert_eq!(EvalBenchmark::from_name("nope"), None);
    }

    #[test]
    fn selection_expands_evalplus_and_general() {
        assert_eq!(
            parse_selection("evalplus").unwrap(),
            EvalBenchmark::ALL.to_vec()
        );
        assert_eq!(
            parse_selection("general").unwrap(),
            EvalBenchmark::ALL.to_vec()
        );
    }

    #[test]
    fn selection_parses_comma_list_and_dedups() {
        assert_eq!(
            parse_selection("humaneval+, mbpp+").unwrap(),
            vec![EvalBenchmark::HumanEvalPlus, EvalBenchmark::MbppPlus]
        );
        assert_eq!(
            parse_selection("mbpp+,mbpp+").unwrap(),
            vec![EvalBenchmark::MbppPlus]
        );
    }

    #[test]
    fn selection_rejects_unknown_token() {
        assert!(matches!(
            parse_selection("humaneval+,bogus"),
            Err(EvalError::UnknownBenchmark(token)) if token == "bogus"
        ));
    }

    #[test]
    fn parses_task_prompts_jsonl() {
        let jsonl = "{\"task_id\":\"HumanEval/0\",\"prompt\":\"def a():\"}\n\n{\"task_id\":\"HumanEval/1\",\"prompt\":\"def b():\"}\n";
        let tasks = parse_tasks_jsonl(jsonl).unwrap();
        assert_eq!(tasks.len(), 2);
        assert_eq!(tasks[0].id, "HumanEval/0");
        assert_eq!(tasks[1].prompt, "def b():");
    }

    #[test]
    fn malformed_task_line_is_an_error_not_a_panic() {
        assert!(matches!(
            parse_tasks_jsonl("{not json"),
            Err(EvalError::Parse(_))
        ));
        assert!(matches!(
            parse_tasks_jsonl("{\"task_id\":\"x\"}"),
            Err(EvalError::Parse(_))
        ));
    }
}
