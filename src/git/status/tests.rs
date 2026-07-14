use super::{format_label, format_pull_request_label, parse_pull_request, parse_status};

fn parse_status_label(porcelain: &str) -> Option<String> {
    parse_status(porcelain).map(|status| format_label(&status))
}

#[test]
fn formats_branch_with_staged_unstaged_and_untracked_flags() {
    let label = parse_status_label(
        &[
            "## feat/first-ink-tui-jsonrpc-backend...origin/feat/first-ink-tui-jsonrpc-backend",
            " M tui/src/App.tsx",
            "A  src/git.rs",
            "?? src/git/tests.rs",
        ]
        .join("\n"),
    );

    assert_eq!(
        label.as_deref(),
        Some("⎇ feat/first-ink-tui-jsonrpc-backend*+%")
    );
}

#[test]
fn formats_a_clean_branch_without_flags() {
    assert_eq!(
        parse_status_label("## main...origin/main\n").as_deref(),
        Some("⎇ main")
    );
}

#[test]
fn strips_upstream_and_ahead_behind_from_the_branch_name() {
    assert_eq!(
        parse_status_label("## main...origin/main [ahead 1, behind 2]\n").as_deref(),
        Some("⎇ main")
    );
}

#[test]
fn labels_a_detached_head() {
    assert_eq!(
        parse_status_label("## HEAD (no branch)\n").as_deref(),
        Some("⎇ HEAD")
    );
}

#[test]
fn labels_a_repository_with_no_commits_yet() {
    assert_eq!(
        parse_status_label("## No commits yet on main\n").as_deref(),
        Some("⎇ main")
    );
}

#[test]
fn separates_staged_from_unstaged_changes() {
    let staged_only = parse_status("## main\nM  src/git.rs\n").unwrap();
    assert!(staged_only.has_staged_changes);
    assert!(!staged_only.has_unstaged_changes);
    assert!(!staged_only.has_untracked_changes);

    let unstaged_only = parse_status("## main\n M src/git.rs\n").unwrap();
    assert!(unstaged_only.has_unstaged_changes);
    assert!(!unstaged_only.has_staged_changes);
}

#[test]
fn treats_untracked_entries_as_untracked_only() {
    let status = parse_status("## main\n?? src/new.rs\n").unwrap();
    assert!(status.has_untracked_changes);
    assert!(!status.has_staged_changes);
    assert!(!status.has_unstaged_changes);
    assert_eq!(format_label(&status), "⎇ main%");
}

#[test]
fn parses_pull_request_number_and_url_and_formats_the_label() {
    let pull_request =
        parse_pull_request("{\"number\":3,\"url\":\"https://github.com/o/r/pull/3\"}\n").unwrap();
    assert_eq!(pull_request.number, 3);
    assert_eq!(pull_request.url, "https://github.com/o/r/pull/3");
    assert_eq!(format_pull_request_label(pull_request.number), "#3");
}

#[test]
fn ignores_unparseable_pull_request_output() {
    assert!(parse_pull_request("").is_none());
    assert!(parse_pull_request("not json").is_none());
}

#[test]
fn returns_none_without_a_branch_header_line() {
    assert!(parse_status_label(" M src/git.rs\n").is_none());
    assert!(parse_status_label("").is_none());
}
