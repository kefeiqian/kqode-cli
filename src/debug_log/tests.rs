use super::layer::TranscriptLayer;
use super::*;
use crate::provider::ChatMessage;
use serde_json::Value;
use std::sync::{Arc, Mutex, MutexGuard, OnceLock};
use tracing::subscriber::with_default;
use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::registry::Registry;

// KQODE_DEBUG / KQODE_LOG_DIR are process-global; serialize env-touching tests.
fn env_guard() -> MutexGuard<'static, ()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(())).lock().unwrap()
}

/// A `Write` sink into a shared buffer so tests can read what the layer emitted.
#[derive(Clone)]
struct SharedBuf(Arc<Mutex<Vec<u8>>>);

impl std::io::Write for SharedBuf {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        self.0.lock().unwrap().extend_from_slice(buf);
        Ok(buf.len())
    }

    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}

/// Emits the given transcript events inside a turn span, capturing the JSONL.
fn capture(turn_id: &str, emit: impl FnOnce()) -> Vec<Value> {
    let sink = Arc::new(Mutex::new(Vec::new()));
    let subscriber = Registry::default().with(TranscriptLayer::new(SharedBuf(sink.clone())));
    with_default(subscriber, || {
        let span = turn_span(turn_id);
        let _enter = span.enter();
        emit();
    });
    let bytes = sink.lock().unwrap().clone();
    String::from_utf8(bytes)
        .unwrap()
        .lines()
        .filter(|line| !line.is_empty())
        .map(|line| serde_json::from_str(line).unwrap())
        .collect()
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
fn empty_debug_falls_through_to_build_default() {
    let _guard = env_guard();
    // An empty value must not force-disable: it falls through to the build
    // default (off under cfg(test)), same as an unset variable.
    unsafe { env::set_var(KQODE_DEBUG_VAR, "") };
    let empty = logging_enabled();
    unsafe { env::remove_var(KQODE_DEBUG_VAR) };
    let unset = logging_enabled();
    assert_eq!(empty, unset);
}

#[test]
fn falsy_debug_disables_logging() {
    let _guard = env_guard();
    unsafe { env::set_var(KQODE_DEBUG_VAR, "0") };
    let enabled = logging_enabled();
    unsafe { env::remove_var(KQODE_DEBUG_VAR) };
    assert!(!enabled);
}

#[test]
fn log_dir_override_beats_home() {
    let _guard = env_guard();
    let dir = env::temp_dir().join(format!("kqode-log-{}", epoch_millis()));
    unsafe { env::set_var(KQODE_LOG_DIR_VAR, &dir) };
    let resolved = resolve_log_dir();
    unsafe { env::remove_var(KQODE_LOG_DIR_VAR) };
    assert_eq!(resolved, Some(dir));
}

#[test]
fn request_event_keeps_messages_nested_and_carries_turn_id() {
    let lines = capture("turn-42", || {
        log_request(
            "kimi-k2.7-code",
            &[
                ChatMessage::system("system prompt"),
                ChatMessage::user("hello there"),
            ],
        );
    });

    assert_eq!(lines.len(), 1);
    let request = &lines[0];
    assert_eq!(request["event"], "request");
    assert_eq!(request["turnId"], "turn-42");
    assert_eq!(request["model"], "kimi-k2.7-code");
    // messages must be a real nested array, not an escaped string.
    assert!(request["messages"].is_array());
    assert_eq!(request["messages"][0]["role"], "system");
    assert_eq!(request["messages"][1]["content"], "hello there");
    assert!(request["ts"].is_number());
}

#[test]
fn response_and_error_events_render_expected_shapes() {
    let lines = capture("turn-7", || {
        log_response("hi back", Some("stop"));
        log_error("auth", "Kimi rejected the API key");
    });

    assert_eq!(lines.len(), 2);
    assert_eq!(lines[0]["event"], "response");
    assert_eq!(lines[0]["text"], "hi back");
    assert_eq!(lines[0]["finishReason"], "stop");
    assert_eq!(lines[1]["event"], "error");
    assert_eq!(lines[1]["errorKind"], "auth");
    assert_eq!(lines[1]["turnId"], "turn-7");
}

#[test]
fn empty_finish_reason_is_omitted() {
    let lines = capture("turn-8", || log_response("done", None));
    assert_eq!(lines[0]["event"], "response");
    assert!(lines[0].get("finishReason").is_none());
}

#[test]
fn session_id_is_nonempty_and_path_safe() {
    let id = super::session::generate_session_id();
    assert!(!id.is_empty());
    assert!(
        id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-'),
        "session id {id:?} must be filesystem-safe"
    );
}

#[test]
fn manifest_records_session_metadata() {
    let dir = env::temp_dir().join(format!("kqode-session-{}-{}", epoch_millis(), std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    super::session::write_manifest(&dir, "sess-123");
    let raw = std::fs::read_to_string(dir.join("session.json")).unwrap();
    let _ = std::fs::remove_dir_all(&dir);

    let manifest: Value = serde_json::from_str(&raw).unwrap();
    assert_eq!(manifest["sessionId"], "sess-123");
    assert!(
        manifest["kqodeVersion"]
            .as_str()
            .is_some_and(|value| !value.is_empty())
    );
    assert!(manifest["os"].as_str().is_some());
    assert!(manifest["startedAtMs"].is_number());
}

#[test]
fn prune_keeps_only_the_retention_window() {
    let root = env::temp_dir().join(format!("kqode-prune-{}-{}", epoch_millis(), std::process::id()));
    std::fs::create_dir_all(&root).unwrap();
    let total = super::session::SESSION_RETENTION + 5;
    for index in 0..total {
        std::fs::create_dir_all(root.join(format!("s{index:03}"))).unwrap();
    }

    super::session::prune_old_sessions(&root);
    let remaining = std::fs::read_dir(&root).unwrap().count();
    let _ = std::fs::remove_dir_all(&root);

    assert_eq!(remaining, super::session::SESSION_RETENTION);
}
