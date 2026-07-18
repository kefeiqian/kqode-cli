use std::{
    fs,
    path::Path,
    process::Command,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use super::run_stdout_in;

#[test]
fn drains_output_larger_than_a_pipe_buffer() {
    let unique = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let repo = std::env::temp_dir().join(format!("kqode-git-output-{unique}"));
    fs::create_dir_all(&repo).unwrap();
    run_git(&repo, &["init", "--quiet"]);
    run_git(&repo, &["config", "user.email", "test@example.com"]);
    run_git(&repo, &["config", "user.name", "KQode Test"]);

    let expected = "x".repeat(128 * 1024);
    fs::write(repo.join("large.txt"), &expected).unwrap();
    run_git(&repo, &["add", "large.txt"]);
    run_git(&repo, &["commit", "--quiet", "-m", "large fixture"]);

    let output = run_stdout_in(
        "git",
        &["show", "HEAD:large.txt"],
        Duration::from_secs(2),
        Some(&repo),
    );

    fs::remove_dir_all(&repo).unwrap();
    assert_eq!(output.as_deref(), Some(expected.as_str()));
}

fn run_git(cwd: &Path, args: &[&str]) {
    assert!(
        Command::new("git")
            .args(args)
            .current_dir(cwd)
            .status()
            .unwrap()
            .success()
    );
}
