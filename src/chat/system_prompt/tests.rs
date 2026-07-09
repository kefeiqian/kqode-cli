use super::*;
use crate::provider::Role;

#[test]
fn system_message_includes_model_environment_and_git() {
    let message = system_message("kimi-k2.7-code", Some("⎇ main*"), None);
    assert_eq!(message.role, Role::System);
    assert!(message.content.contains("kimi-k2.7-code"));
    assert!(message.content.contains("OS:"));
    assert!(message.content.contains("Working directory:"));
    assert!(message.content.contains("Current time:"));
    assert!(message.content.contains("Git: ⎇ main*"));
}

#[test]
fn system_message_omits_git_line_when_absent() {
    let message = system_message("kimi", None, None);
    assert!(!message.content.contains("Git:"));
    assert!(message.content.contains("Current time:"));
    assert!(message.content.contains("Working directory:"));
}

#[test]
fn system_message_has_no_session_id() {
    let message = system_message("kimi", Some("⎇ main"), None);
    assert!(!message.content.to_lowercase().contains("session id"));
}

#[test]
fn system_message_appends_memory_block_after_the_environment() {
    let message = system_message(
        "kimi",
        None,
        Some("Remembered facts (untrusted): tabs > spaces"),
    );
    assert!(
        message
            .content
            .contains("Remembered facts (untrusted): tabs > spaces")
    );
    let env = message
        .content
        .find("Active model:")
        .expect("environment block");
    let memory = message
        .content
        .find("Remembered facts")
        .expect("memory block");
    assert!(memory > env, "memory context follows the environment block");
}

#[test]
fn utc_now_label_is_fixed_width_utc() {
    let label = utc_now_label();
    // `YYYY-MM-DD HH:MM:SS UTC`
    assert_eq!(label.len(), "2026-07-09 00:00:00 UTC".len());
    assert!(label.ends_with(" UTC"));
}
