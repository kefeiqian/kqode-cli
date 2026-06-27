#[path = "common/cli.rs"]
mod cli;

use kqode::protocol::BACKEND_MODE_ARG;

use cli::run_cli;

#[test]
fn invalid_invocation_exits_with_visible_error() {
    let output = run_cli(&["--not-a-kqode-mode"]);

    assert!(!output.status.success(), "{output:?}");
    assert!(!output.stderr.is_empty());
}

#[test]
fn backend_mode_rejects_extra_arguments() {
    let output = run_cli(&[BACKEND_MODE_ARG, "extra"]);

    assert!(!output.status.success(), "{output:?}");
    assert!(String::from_utf8_lossy(&output.stderr).contains("extra argument"));
}

#[test]
fn default_invocation_stays_harmless() {
    let output = run_cli(&[]);

    assert!(output.status.success(), "{output:?}");
    assert!(String::from_utf8_lossy(&output.stdout).contains("KQode starter CLI"));
}
