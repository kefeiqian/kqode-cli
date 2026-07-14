use std::time::Duration;

use serde::Deserialize;

use super::command::run_stdout;

/// Command used for local repository status.
const GIT_COMMAND: &str = "git";
/// Command used for GitHub pull-request lookup.
const GITHUB_COMMAND: &str = "gh";
/// Arguments that ask git for stable branch/status porcelain.
const GIT_STATUS_ARGS: &[&str] = &["status", "--porcelain=v1", "--branch"];
/// Arguments that ask GitHub CLI for the current branch's pull-request number
/// and URL as a JSON object (e.g. `{"number":3,"url":"https://…/pull/3"}`).
const PULL_REQUEST_ARGS: &[&str] = &["pr", "view", "--json", "number,url"];
/// Branch glyph prefixing every status label.
const GIT_BRANCH_ICON: &str = "⎇";
/// Flag appended when the worktree has unstaged changes.
const UNSTAGED_CHANGE_FLAG: &str = "*";
/// Flag appended when the index has staged changes.
const STAGED_CHANGE_FLAG: &str = "+";
/// Flag appended when the worktree has untracked files.
const UNTRACKED_CHANGE_FLAG: &str = "%";
/// Prefix of the porcelain `--branch` header line.
const STATUS_BRANCH_PREFIX: &str = "## ";
/// Separator between the local branch and its upstream in the header line.
const STATUS_UPSTREAM_SEPARATOR: &str = "...";
/// Header text for a repository with no commits yet (`## No commits yet on X`).
const NO_COMMITS_BRANCH_PREFIX: &str = "No commits yet on ";
/// Header text emitted for a detached HEAD.
const DETACHED_HEAD_STATUS: &str = "HEAD (no branch)";
/// Prefix for a pull-request status segment.
const PULL_REQUEST_LABEL_PREFIX: &str = "#";
/// Ceiling for each git/GitHub status command before it is treated as unavailable.
const COMMAND_TIMEOUT: Duration = Duration::from_secs(2);
/// Formatted workspace source-control status returned to clients.
#[derive(Debug, Eq, PartialEq)]
pub struct WorkspaceGitStatus {
    pub label: String,
    pub pull_request_label: Option<String>,
    pub pull_request_url: Option<String>,
}

/// The current branch's GitHub pull request, as reported by `gh pr view`.
#[derive(Debug, Deserialize)]
struct PullRequest {
    number: u32,
    url: String,
}

/// Parsed porcelain status of the workspace worktree.
#[derive(Debug, Eq, PartialEq)]
struct GitStatus {
    branch: String,
    has_unstaged_changes: bool,
    has_staged_changes: bool,
    has_untracked_changes: bool,
}

/// Returns the formatted git/GitHub status for the workspace, or `None` when
/// the directory is not a git repository or `git` is unavailable. Blocking; call
/// it off the backend's request loop (e.g. on a thread).
#[must_use]
pub fn status() -> Option<WorkspaceGitStatus> {
    let parsed_status = read_status()?;
    let pull_request = pull_request();

    Some(WorkspaceGitStatus {
        label: format_label(&parsed_status),
        pull_request_label: pull_request
            .as_ref()
            .map(|pull_request| format_pull_request_label(pull_request.number)),
        pull_request_url: pull_request.map(|pull_request| pull_request.url),
    })
}

fn read_status() -> Option<GitStatus> {
    let porcelain = run_stdout(GIT_COMMAND, GIT_STATUS_ARGS, COMMAND_TIMEOUT)?;
    parse_status(&porcelain)
}

fn pull_request() -> Option<PullRequest> {
    let stdout = run_stdout(GITHUB_COMMAND, PULL_REQUEST_ARGS, COMMAND_TIMEOUT)?;
    parse_pull_request(&stdout)
}

fn parse_status(porcelain: &str) -> Option<GitStatus> {
    let lines: Vec<&str> = porcelain.lines().filter(|line| !line.is_empty()).collect();
    let branch_line = lines
        .iter()
        .find(|line| line.starts_with(STATUS_BRANCH_PREFIX))?;
    let branch = parse_branch_name(branch_line);

    let mut status = GitStatus {
        branch,
        has_unstaged_changes: false,
        has_staged_changes: false,
        has_untracked_changes: false,
    };

    for line in &lines {
        if line.starts_with(STATUS_BRANCH_PREFIX) {
            continue;
        }
        if line.starts_with("??") {
            status.has_untracked_changes = true;
            continue;
        }

        let code = line.as_bytes();
        if let Some(&staged) = code.first()
            && is_change_flag(staged)
        {
            status.has_staged_changes = true;
        }
        if let Some(&unstaged) = code.get(1)
            && is_change_flag(unstaged)
        {
            status.has_unstaged_changes = true;
        }
    }

    Some(status)
}

/// Whether a porcelain XY status byte marks a tracked change — i.e. not clean
/// (` `), untracked (`?`), or ignored (`!`).
fn is_change_flag(code: u8) -> bool {
    code != b' ' && code != b'?' && code != b'!'
}

/// Extracts the branch name from the porcelain `## ...` header line.
fn parse_branch_name(branch_line: &str) -> String {
    let branch_status = &branch_line[STATUS_BRANCH_PREFIX.len()..];

    if let Some(rest) = branch_status.strip_prefix(NO_COMMITS_BRANCH_PREFIX) {
        return rest.to_owned();
    }
    if branch_status == DETACHED_HEAD_STATUS {
        return "HEAD".to_owned();
    }

    let without_upstream = branch_status
        .split(STATUS_UPSTREAM_SEPARATOR)
        .next()
        .unwrap_or(branch_status);
    without_upstream
        .split(" [")
        .next()
        .unwrap_or(without_upstream)
        .to_owned()
}

fn parse_pull_request(stdout: &str) -> Option<PullRequest> {
    serde_json::from_str(stdout.trim()).ok()
}

fn format_label(status: &GitStatus) -> String {
    format!(
        "{GIT_BRANCH_ICON} {}{}",
        status.branch,
        format_flags(status)
    )
}

fn format_flags(status: &GitStatus) -> String {
    let mut flags = String::new();
    if status.has_unstaged_changes {
        flags.push_str(UNSTAGED_CHANGE_FLAG);
    }
    if status.has_staged_changes {
        flags.push_str(STAGED_CHANGE_FLAG);
    }
    if status.has_untracked_changes {
        flags.push_str(UNTRACKED_CHANGE_FLAG);
    }
    flags
}

fn format_pull_request_label(number: u32) -> String {
    format!("{PULL_REQUEST_LABEL_PREFIX}{number}")
}

#[cfg(test)]
mod tests;
