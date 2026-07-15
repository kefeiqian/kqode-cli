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
/// Ceiling for the local `git status` call before it is treated as unavailable.
/// This is a fast, offline command, so a tight budget is fine.
const GIT_STATUS_TIMEOUT: Duration = Duration::from_secs(2);
/// Ceiling for the `gh pr view` call before it is treated as unavailable.
///
/// Unlike `git status`, this performs a network round-trip to the GitHub API,
/// whose latency is variable and regularly exceeds the local-git budget. It is
/// therefore given a larger timeout so a slow-but-succeeding lookup is not
/// killed, which would drop the PR label from the status line.
const PULL_REQUEST_TIMEOUT: Duration = Duration::from_secs(8);
/// The current branch's pull request, formatted for display: a `#N` `label` and
/// the PR's web `url`. Returned to clients so the TUI can render a hyperlink.
#[derive(Debug, Eq, PartialEq)]
pub struct PullRequestStatus {
    pub label: String,
    pub url: String,
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

/// Returns the formatted working-tree label (e.g. `⎇ main*`), or `None` when the
/// directory is not a git repository or `git` is unavailable.
///
/// This is a fast, local query with no network I/O, so the TUI refreshes it
/// after every turn. Blocking; call it off the backend's request loop (e.g. on a
/// thread).
#[must_use]
pub fn status_label() -> Option<String> {
    Some(format_label(&read_status()?))
}

/// Returns the current branch's GitHub pull request as a display label and URL,
/// or `None` when there is no PR (or `gh` is unavailable).
///
/// Unlike [`status_label`], this performs a network round-trip via `gh`, so the
/// TUI fetches it once at session bootstrap rather than on every turn. Blocking;
/// call it off the backend's request loop (e.g. on a thread).
#[must_use]
pub fn pull_request() -> Option<PullRequestStatus> {
    let pull_request = read_pull_request()?;
    Some(PullRequestStatus {
        label: format_pull_request_label(pull_request.number),
        url: pull_request.url,
    })
}

fn read_status() -> Option<GitStatus> {
    let porcelain = run_stdout(GIT_COMMAND, GIT_STATUS_ARGS, GIT_STATUS_TIMEOUT)?;
    parse_status(&porcelain)
}

fn read_pull_request() -> Option<PullRequest> {
    let stdout = run_stdout(GITHUB_COMMAND, PULL_REQUEST_ARGS, PULL_REQUEST_TIMEOUT)?;
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
