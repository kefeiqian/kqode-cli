#[path = "common/cli.rs"]
mod cli;

use std::process::Command;

use kqode::{protocol::BACKEND_MODE_ARG, store::STORE_FATAL_SENTINEL};

use cli::run_cli;

const STORE_FAILURE_EXIT_CODE: i32 = 75;

#[test]
fn invalid_invocation_exits_with_visible_error() {
    let output = run_cli(&["--not-a-kqode-mode"]);

    assert!(!output.status.success(), "{output:?}");
    assert_ne!(output.status.code(), Some(STORE_FAILURE_EXIT_CODE));
    assert!(!output.stderr.is_empty());
}

#[test]
fn backend_mode_rejects_extra_arguments() {
    let output = run_cli(&[BACKEND_MODE_ARG, "extra"]);

    assert!(!output.status.success(), "{output:?}");
    assert_ne!(output.status.code(), Some(STORE_FAILURE_EXIT_CODE));
    assert!(String::from_utf8_lossy(&output.stderr).contains("extra argument"));
}

#[test]
fn default_invocation_stays_harmless() {
    let output = run_cli(&[]);

    assert!(output.status.success(), "{output:?}");
    assert!(String::from_utf8_lossy(&output.stdout).contains("KQode starter CLI"));
}

#[test]
fn backend_store_failure_exits_with_store_code_without_ready() {
    let home = tempfile::tempdir().unwrap();
    let kqode_home = home.path().join(".kqode");
    std::fs::create_dir(&kqode_home).unwrap();
    std::fs::write(kqode_home.join("kqode.db"), b"not a sqlite database").unwrap();

    let output = Command::new(env!("CARGO_BIN_EXE_kqode"))
        .arg(BACKEND_MODE_ARG)
        .env("HOME", home.path())
        .env("USERPROFILE", home.path())
        .env("CUSTOM_API_KEY", "")
        .env("KQODE_DEBUG", "0")
        .output()
        .expect("binary runs");

    assert_eq!(output.status.code(), Some(STORE_FAILURE_EXIT_CODE));
    assert!(
        output.stdout.is_empty(),
        "store failure must not emit backend ready: {:?}",
        String::from_utf8_lossy(&output.stdout)
    );
    assert!(
        String::from_utf8_lossy(&output.stderr).starts_with(STORE_FATAL_SENTINEL),
        "store failure stderr must start with sentinel: {:?}",
        String::from_utf8_lossy(&output.stderr)
    );
}

#[test]
fn backend_without_home_exits_with_store_code_and_sentinel() {
    let output = Command::new(env!("CARGO_BIN_EXE_kqode"))
        .arg(BACKEND_MODE_ARG)
        .env_remove("HOME")
        .env_remove("USERPROFILE")
        .env("CUSTOM_API_KEY", "")
        .env("KQODE_DEBUG", "0")
        .output()
        .expect("binary runs");

    assert_eq!(output.status.code(), Some(STORE_FAILURE_EXIT_CODE));
    assert!(
        output.stdout.is_empty(),
        "store failure must not emit backend ready: {:?}",
        String::from_utf8_lossy(&output.stdout)
    );
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(
        stderr.starts_with(STORE_FATAL_SENTINEL),
        "store failure stderr must start with sentinel: {stderr:?}"
    );
    assert!(stderr.contains("could not resolve the KQode database path"));
}
