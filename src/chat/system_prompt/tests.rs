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
fn system_message_places_memory_before_the_volatile_environment() {
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
    assert!(
        memory < env,
        "memory is a stable section and renders before the volatile environment block"
    );
}

#[test]
fn system_message_orders_stable_sections_before_the_environment() {
    let message = system_message("kimi-k2", Some("⎇ main"), None);
    let identity = message.content.find("You are KQode").expect("identity");
    let tone = message
        .content
        .find("# Tone and style")
        .expect("tone section");
    let safety = message.content.find("# Safety").expect("safety section");
    let env = message
        .content
        .find("Environment:")
        .expect("environment block");
    assert!(
        identity < tone && tone < safety && safety < env,
        "stable identity/tone/safety sections precede the volatile environment block"
    );
}

#[test]
fn eval_system_message_has_persona_without_environment_noise() {
    let message = eval_system_message();
    assert_eq!(message.role, Role::System);
    assert!(message.content.contains("You are KQode"));
    assert!(message.content.contains("# Tone and style"));
    assert!(message.content.contains("# Safety"));
    assert!(!message.content.contains("Environment:"));
    assert!(!message.content.contains("Working directory:"));
    assert!(!message.content.contains("Current time:"));
    assert!(!message.content.contains("Git:"));
    assert!(!message.content.contains("Active model:"));
}

#[test]
fn eval_system_message_is_deterministic() {
    // No volatile environment block (notably the timestamp), so repeated calls
    // must be byte-identical for reproducible eval runs.
    assert_eq!(eval_system_message().content, eval_system_message().content);
}

#[test]
fn utc_now_label_is_fixed_width_utc() {
    let label = utc_now_label();
    // `YYYY-MM-DD HH:MM:SS UTC`
    assert_eq!(label.len(), "2026-07-09 00:00:00 UTC".len());
    assert!(label.ends_with(" UTC"));
}

#[test]
fn stable_prefix_is_identical_across_git_changes() {
    // Git status is volatile (it lives in the environment section), so changing
    // only git must not alter the stable prefix (identity/tone/safety/memory) —
    // a provider prefix cache would then see identical bytes up to the env block.
    let a = system_message("kimi-k2", Some("⎇ main"), None);
    let b = system_message("kimi-k2", Some("⎇ feature*"), None);
    let prefix_a = a
        .content
        .split("Environment:")
        .next()
        .expect("stable prefix before the environment block")
        .to_owned();
    let prefix_b = b
        .content
        .split("Environment:")
        .next()
        .expect("stable prefix before the environment block")
        .to_owned();
    assert_eq!(
        prefix_a, prefix_b,
        "volatile git must not change the stable prefix"
    );
    assert_ne!(a.content, b.content, "the git label really did differ");
}

#[test]
fn system_prompt_golden_shape() {
    // Deterministic, in-code "golden" assertion of the full ordered shape (no
    // snapshot crate; CRLF-immune). Sections must appear in stable-first order,
    // memory before the volatile environment block, env lines in order last.
    let message = system_message(
        "kimi-k2.7-code",
        Some("⎇ main*"),
        Some("Remembered facts (untrusted): prefer tabs"),
    );
    let markers = [
        "You are KQode",
        "# Tone and style",
        "# Safety",
        "Remembered facts",
        "Environment:",
        "- OS: ",
        "- Working directory: ",
        "- Current time: ",
        "- Active model: kimi-k2.7-code",
        "- Git: ⎇ main*",
    ];
    let mut last = 0usize;
    for marker in markers {
        let at = message
            .content
            .find(marker)
            .unwrap_or_else(|| panic!("missing section marker: {marker}"));
        assert!(at >= last, "section marker out of order: {marker}");
        last = at;
    }
}
