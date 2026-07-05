use super::*;
use crate::provider::ChatMessage;
use std::sync::{Mutex as StdMutex, MutexGuard, OnceLock};

// KQODE_DEBUG / KQODE_LOG_DIR are process-global; serialize env-touching tests.
fn env_guard() -> MutexGuard<'static, ()> {
    static LOCK: OnceLock<StdMutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| StdMutex::new(())).lock().unwrap()
}

fn temp_dir(label: &str) -> PathBuf {
    let dir = env::temp_dir().join(format!("kqode-log-test-{}-{}", label, epoch_millis()));
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

#[test]
fn truthy_values_enable_and_others_disable() {
    for value in ["1", "true", "on", "YES", " True "] {
        assert!(is_truthy(value), "{value:?} should be truthy");
    }
    for value in ["0", "false", "off", "", "nope"] {
        assert!(!is_truthy(value), "{value:?} should be falsy");
    }
}

#[test]
fn disabled_when_debug_is_falsy() {
    let _guard = env_guard();
    unsafe { env::set_var(KQODE_DEBUG_VAR, "0") };
    assert!(DebugLogger::initialize().is_none());
    unsafe { env::remove_var(KQODE_DEBUG_VAR) };
}

#[test]
fn empty_debug_falls_through_to_build_default() {
    let _guard = env_guard();
    // An empty value must not force-disable: it falls through to the build
    // default (off under cfg(test)), same as an unset variable.
    unsafe { env::set_var(KQODE_DEBUG_VAR, "") };
    let empty = DebugLogger::initialize().is_none();
    unsafe { env::remove_var(KQODE_DEBUG_VAR) };
    let unset = DebugLogger::initialize().is_none();
    assert_eq!(empty, unset);
}

#[test]
fn log_dir_override_beats_home() {
    let _guard = env_guard();
    let dir = temp_dir("override");
    unsafe { env::set_var(KQODE_LOG_DIR_VAR, &dir) };
    let resolved = resolve_log_dir().unwrap();
    unsafe { env::remove_var(KQODE_LOG_DIR_VAR) };
    assert_eq!(resolved, dir);
    std::fs::remove_dir_all(&dir).ok();
}

#[test]
fn writes_request_response_and_error_lines_without_the_key() {
    let _guard = env_guard();
    let dir = temp_dir("write");
    unsafe {
        env::set_var(KQODE_DEBUG_VAR, "1");
        env::set_var(KQODE_LOG_DIR_VAR, &dir);
    }

    let logger = DebugLogger::initialize().expect("logging enabled");
    logger.log_request(
        "turn-1",
        "kimi-k2.7-code",
        &[
            ChatMessage::system("system prompt"),
            ChatMessage::user("hello there"),
        ],
    );
    logger.log_response("turn-1", "hi back", Some("stop"));
    logger.log_error("turn-1", "auth", "Kimi rejected the API key");

    unsafe {
        env::remove_var(KQODE_DEBUG_VAR);
        env::remove_var(KQODE_LOG_DIR_VAR);
    }

    let log_file = std::fs::read_dir(&dir)
        .unwrap()
        .filter_map(Result::ok)
        .find(|entry| entry.file_name().to_string_lossy().starts_with("kqode-"))
        .expect("a log file was created");
    let contents = std::fs::read_to_string(log_file.path()).unwrap();
    let lines: Vec<&str> = contents.lines().collect();
    assert_eq!(lines.len(), 3, "one JSON line per event: {contents}");

    let request: Value = serde_json::from_str(lines[0]).unwrap();
    assert_eq!(request["event"], "request");
    assert_eq!(request["turnId"], "turn-1");
    assert_eq!(request["model"], "kimi-k2.7-code");
    assert_eq!(request["messages"][1]["content"], "hello there");

    let response: Value = serde_json::from_str(lines[1]).unwrap();
    assert_eq!(response["event"], "response");
    assert_eq!(response["text"], "hi back");
    assert_eq!(response["finishReason"], "stop");

    let error: Value = serde_json::from_str(lines[2]).unwrap();
    assert_eq!(error["event"], "error");
    assert_eq!(error["errorKind"], "auth");

    // The API key must never appear anywhere in the log.
    assert!(!contents.contains("Bearer"), "{contents}");

    std::fs::remove_dir_all(&dir).ok();
}
