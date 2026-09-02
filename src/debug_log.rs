//! Opt-in runtime debug logging built on `tracing`.
//!
//! When enabled, [`init`] installs a global subscriber whose `TranscriptLayer`
//! appends the exact request sent to the LLM and the response received back to a
//! per-session JSONL file at `~/.kqode/logs/<session>/backend.jsonl`. The emit helpers
//! ([`log_request`]/[`log_response`]/[`log_error`]) are plain `tracing` events,
//! so they are cheap no-ops when logging is disabled (no subscriber installed).
//!
//! Enabled when `KQODE_DEBUG` is truthy; otherwise it defaults on in dev builds
//! ([`BuildEnv::Dev`]) and off in packaged/prod builds. The API key is never part
//! of the logged payload (only the system/user messages and the model id are).

mod layer;
mod session;

use std::env;
use std::io::Write;
use std::path::PathBuf;
use std::sync::Once;
use std::time::{SystemTime, UNIX_EPOCH};

use tracing::Span;
use tracing_appender::non_blocking::WorkerGuard;
use tracing_appender::rolling;
use tracing_subscriber::filter::EnvFilter;
use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::registry::Registry;

use crate::build_env::BuildEnv;
use crate::provider::ChatMessage;
use layer::TranscriptLayer;

/// Env var toggling debug logging (`1`/`true`/`on`/`yes` enable it).
pub const KQODE_DEBUG_VAR: &str = "KQODE_DEBUG";

/// Env var overriding the log directory (used by tests to avoid the real home).
pub const KQODE_LOG_DIR_VAR: &str = "KQODE_LOG_DIR";

/// `tracing` target that marks transcript events for `TranscriptLayer`.
pub(crate) const TRANSCRIPT_TARGET: &str = "kqode::transcript";

/// Default `EnvFilter` directive when `RUST_LOG` is unset: transcript on, rest off.
const DEFAULT_FILTER: &str = "kqode::transcript=info";

/// Subdirectory under the KQode home holding runtime logs.
const LOGS_DIRNAME: &str = "logs";

// Field names on transcript spans/events (snake_case for `tracing`; the layer
// maps them to the camelCase on-disk JSON keys).
pub(crate) const FIELD_TURN_ID: &str = "turn_id";
pub(crate) const FIELD_KIND: &str = "kind";
pub(crate) const FIELD_MODEL: &str = "model";
pub(crate) const FIELD_MESSAGES: &str = "messages";
pub(crate) const FIELD_TEXT: &str = "text";
pub(crate) const FIELD_FINISH_REASON: &str = "finish_reason";
pub(crate) const FIELD_ERROR_KIND: &str = "error_kind";
pub(crate) const FIELD_MESSAGE: &str = "message";

// `event` kinds recorded in the `kind` field.
const KIND_REQUEST: &str = "request";
const KIND_RESPONSE: &str = "response";
const KIND_ERROR: &str = "error";

/// Installs the global transcript subscriber when logging is enabled, writing to
/// `<logs>/<session_id>/backend.jsonl` and a sibling `session.json` manifest.
///
/// Returns the [`WorkerGuard`] for the non-blocking writer, which the caller
/// must hold for the process lifetime so buffered lines flush on exit. Returns
/// `None` when logging is disabled, the session directory cannot be created, or
/// a global subscriber is already set. Old session directories are pruned
/// best-effort on startup.
#[must_use]
pub fn init(session_id: &str) -> Option<WorkerGuard> {
    if !logging_enabled() {
        return None;
    }
    let logs_root = resolve_log_dir()?;
    let session_dir = logs_root.join(session_id);
    // Create the session dir eagerly so the manifest and appender have a home.
    // Tests run with `KQODE_DEBUG=0`, so this never touches the real logs root.
    if std::fs::create_dir_all(&session_dir).is_err() {
        return None;
    }
    session::write_manifest(&session_dir, session_id);

    let appender = MkdirWriter::new(
        session_dir.clone(),
        rolling::never(&session_dir, session::BACKEND_LOG_FILENAME),
    );
    let (writer, guard) = tracing_appender::non_blocking(appender);

    let filter =
        EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new(DEFAULT_FILTER));
    let subscriber = Registry::default()
        .with(filter)
        .with(TranscriptLayer::new(writer));

    let installed = tracing::subscriber::set_global_default(subscriber)
        .ok()
        .map(|()| guard);
    // Best-effort retention: keep the most recent sessions (this one included).
    session::prune_old_sessions(&logs_root);
    installed
}

/// Mints a session id for this backend spawn (see the `session` module).
///
/// Exposed so the caller can announce the id on the readiness notification
/// regardless of whether logging is enabled.
#[must_use]
pub fn new_session_id() -> String {
    session::generate_session_id()
}

/// Builds the turn span that stamps `turn_id` onto every transcript event
/// emitted while it is entered. Instrument the streaming turn with it.
#[must_use]
pub fn turn_span(turn_id: &str) -> Span {
    tracing::info_span!(target: TRANSCRIPT_TARGET, "turn", turn_id = turn_id)
}

/// Logs the request about to be sent to the provider (model + messages).
pub fn log_request(model: &str, messages: &[ChatMessage]) {
    let messages = serde_json::to_string(messages).unwrap_or_else(|_| "[]".to_owned());
    tracing::info!(
        target: TRANSCRIPT_TARGET,
        kind = KIND_REQUEST,
        model,
        messages = messages.as_str(),
    );
}

/// Logs the completed assistant response and its finish reason.
pub fn log_response(text: &str, finish_reason: Option<&str>) {
    tracing::info!(
        target: TRANSCRIPT_TARGET,
        kind = KIND_RESPONSE,
        text,
        finish_reason = finish_reason.unwrap_or(""),
    );
}

/// Logs a turn that ended in a provider/network error.
pub fn log_error(error_kind: &str, message: &str) {
    tracing::info!(
        target: TRANSCRIPT_TARGET,
        kind = KIND_ERROR,
        error_kind,
        message,
    );
}

/// Whether transcript logging is currently recording.
///
/// Returns `true` only when an installed subscriber is interested in transcript
/// events, so hot paths can skip building debug-only payloads (the full response
/// buffer and request serialization) when logging is off — the packaged/prod
/// default.
#[must_use]
pub fn transcript_enabled() -> bool {
    tracing::enabled!(target: TRANSCRIPT_TARGET, tracing::Level::INFO)
}

/// Whether debug logging should run for this process.
///
/// A non-empty `KQODE_DEBUG` wins (`1`/`true`/`on`/`yes` enable, anything else
/// disables); when it is unset or empty, logging defaults on in dev builds and
/// off in packaged/prod builds.
fn logging_enabled() -> bool {
    match env::var(KQODE_DEBUG_VAR) {
        Ok(value) if !value.trim().is_empty() => is_truthy(&value),
        _ => BuildEnv::current() == BuildEnv::Dev,
    }
}

fn is_truthy(value: &str) -> bool {
    matches!(
        value.trim().to_ascii_lowercase().as_str(),
        "1" | "true" | "on" | "yes"
    )
}

/// Resolves the logs directory: `KQODE_LOG_DIR` if set, else `~/.kqode/logs`.
fn resolve_log_dir() -> Option<PathBuf> {
    if let Ok(dir) = env::var(KQODE_LOG_DIR_VAR)
        && !dir.trim().is_empty()
    {
        return Some(PathBuf::from(dir));
    }
    Some(crate::paths::kqode_home()?.join(LOGS_DIRNAME))
}

fn epoch_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis() as u64)
        .unwrap_or(0)
}

/// Wraps the rolling appender to create the logs directory on first write, so an
/// enabled-but-unused backend (e.g. a turn is never run) never touches the disk.
struct MkdirWriter<W> {
    dir: PathBuf,
    ensured: Once,
    inner: W,
}

impl<W: Write> MkdirWriter<W> {
    fn new(dir: PathBuf, inner: W) -> Self {
        Self {
            dir,
            ensured: Once::new(),
            inner,
        }
    }
}

impl<W: Write> Write for MkdirWriter<W> {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        self.ensured.call_once(|| {
            let _ = std::fs::create_dir_all(&self.dir);
        });
        self.inner.write(buf)
    }

    fn flush(&mut self) -> std::io::Result<()> {
        self.inner.flush()
    }
}

#[cfg(test)]
mod tests;
