//! A `tracing` layer that renders KQode transcript events (target
//! [`TRANSCRIPT_TARGET`](super::TRANSCRIPT_TARGET)) into the stable JSONL shape
//! `{ts, turnId, event, model, messages, text, finishReason, errorKind,
//! message}`, one line per event, keeping `messages` as a nested array.
//!
//! `turnId` is read from the enclosing turn span, so the emit helpers never
//! repeat it. Non-transcript events are ignored by this layer.

use std::io::Write;
use std::sync::{Arc, Mutex};

use serde_json::{Map, Value};
use tracing::field::{Field, Visit};
use tracing::span::Attributes;
use tracing::{Event, Id, Subscriber};
use tracing_subscriber::Layer;
use tracing_subscriber::layer::Context;
use tracing_subscriber::registry::LookupSpan;

use super::{
    FIELD_ERROR_KIND, FIELD_FINISH_REASON, FIELD_KIND, FIELD_MESSAGE, FIELD_MESSAGES, FIELD_MODEL,
    FIELD_TEXT, FIELD_TURN_ID, TRANSCRIPT_TARGET, epoch_millis,
};

/// `turn_id` captured from a turn span, stored in the span's extensions.
struct TurnId(String);

/// Renders transcript events to `writer` as JSONL. `writer` is shared behind a
/// mutex so concurrent turns cannot interleave partial lines.
pub struct TranscriptLayer<W> {
    writer: Arc<Mutex<W>>,
}

impl<W: Write> TranscriptLayer<W> {
    pub fn new(writer: W) -> Self {
        Self {
            writer: Arc::new(Mutex::new(writer)),
        }
    }
}

impl<S, W> Layer<S> for TranscriptLayer<W>
where
    S: Subscriber + for<'a> LookupSpan<'a>,
    W: Write + Send + 'static,
{
    fn on_new_span(&self, attrs: &Attributes<'_>, id: &Id, ctx: Context<'_, S>) {
        let mut visitor = TurnIdVisitor(None);
        attrs.record(&mut visitor);
        if let (Some(turn_id), Some(span)) = (visitor.0, ctx.span(id)) {
            span.extensions_mut().insert(TurnId(turn_id));
        }
    }

    fn on_event(&self, event: &Event<'_>, ctx: Context<'_, S>) {
        if event.metadata().target() != TRANSCRIPT_TARGET {
            return;
        }

        let mut fields = EventVisitor::default();
        event.record(&mut fields);

        let mut line = Map::new();
        line.insert("ts".to_owned(), Value::from(epoch_millis()));
        if let Some(turn_id) = turn_id_in_scope(event, &ctx) {
            line.insert("turnId".to_owned(), Value::from(turn_id));
        }
        fields.emit_into(&mut line);

        let Ok(mut rendered) = serde_json::to_vec(&Value::Object(line)) else {
            return;
        };
        rendered.push(b'\n');
        if let Ok(mut writer) = self.writer.lock() {
            let _ = writer.write_all(&rendered);
        }
    }
}

/// Finds the nearest enclosing span carrying a [`TurnId`].
fn turn_id_in_scope<S>(event: &Event<'_>, ctx: &Context<'_, S>) -> Option<String>
where
    S: Subscriber + for<'a> LookupSpan<'a>,
{
    ctx.event_scope(event)?.find_map(|span| {
        span.extensions()
            .get::<TurnId>()
            .map(|turn_id| turn_id.0.clone())
    })
}

/// Captures `turn_id` from a span's fields.
struct TurnIdVisitor(Option<String>);

impl Visit for TurnIdVisitor {
    fn record_str(&mut self, field: &Field, value: &str) {
        if field.name() == FIELD_TURN_ID {
            self.0 = Some(value.to_owned());
        }
    }

    fn record_debug(&mut self, _field: &Field, _value: &dyn std::fmt::Debug) {}
}

/// Collects the string fields of one transcript event.
#[derive(Default)]
struct EventVisitor {
    kind: Option<String>,
    model: Option<String>,
    messages: Option<String>,
    text: Option<String>,
    finish_reason: Option<String>,
    error_kind: Option<String>,
    message: Option<String>,
}

impl EventVisitor {
    /// Writes the collected fields into `line`, mapping snake_case event fields
    /// to the transcript's camelCase JSON keys and nesting `messages`.
    fn emit_into(self, line: &mut Map<String, Value>) {
        if let Some(kind) = self.kind {
            line.insert("event".to_owned(), Value::from(kind));
        }
        if let Some(model) = self.model {
            line.insert("model".to_owned(), Value::from(model));
        }
        if let Some(messages) = self.messages {
            let nested = serde_json::from_str(&messages).unwrap_or(Value::Null);
            line.insert("messages".to_owned(), nested);
        }
        if let Some(text) = self.text {
            line.insert("text".to_owned(), Value::from(text));
        }
        if let Some(finish_reason) = self.finish_reason.filter(|reason| !reason.is_empty()) {
            line.insert("finishReason".to_owned(), Value::from(finish_reason));
        }
        if let Some(error_kind) = self.error_kind {
            line.insert("errorKind".to_owned(), Value::from(error_kind));
        }
        if let Some(message) = self.message {
            line.insert("message".to_owned(), Value::from(message));
        }
    }
}

impl Visit for EventVisitor {
    fn record_str(&mut self, field: &Field, value: &str) {
        let slot = match field.name() {
            FIELD_KIND => &mut self.kind,
            FIELD_MODEL => &mut self.model,
            FIELD_MESSAGES => &mut self.messages,
            FIELD_TEXT => &mut self.text,
            FIELD_FINISH_REASON => &mut self.finish_reason,
            FIELD_ERROR_KIND => &mut self.error_kind,
            FIELD_MESSAGE => &mut self.message,
            _ => return,
        };
        *slot = Some(value.to_owned());
    }

    fn record_debug(&mut self, _field: &Field, _value: &dyn std::fmt::Debug) {}
}
