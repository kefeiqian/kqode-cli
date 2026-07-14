//! Git working-tree status for the current workspace.
//!
//! The backend runs in the workspace directory (the TUI spawns it with
//! `cwd = workspaceCwd`), so `git status` is invoked in the inherited process
//! cwd — no path argument is threaded through the protocol. Parsing and label
//! formatting live here in the core runtime so the headless CLI and the TUI show
//! the same string; the TUI only renders whatever label this returns.

use std::process::{Command, Stdio};

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
/// Parsed porcelain status of the workspace worktree.
#[derive(Debug, Eq, PartialEq)]
struct GitStatus {
    branch: String,
    has_unstaged_changes: bool,
    has_staged_changes: bool,
    has_untracked_changes: bool,
}

/// Returns the formatted git status label for the workspace, or `None` when the
/// directory is not a git repository or `git` is unavailable. Blocking; call it
/// off the backend's request loop (e.g. on a thread).
#[must_use]
pub fn status_label() -> Option<String> {
    let output = Command::new("git")
        .args(["status", "--porcelain=v1", "--branch"])
        .stdin(Stdio::null())
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }

    parse_status_label(&String::from_utf8_lossy(&output.stdout))
}

/// Formats the porcelain `git status --branch` output into a display label, or
/// `None` when no branch header line is present.
fn parse_status_label(porcelain: &str) -> Option<String> {
    parse_status(porcelain).map(|status| format_label(&status))
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
        if line.starts_with("??") {
            status.has_untracked_changes = true;
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

#[cfg(test)]
mod tests;
