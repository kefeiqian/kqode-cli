use super::RuntimeEvent;

/// Receives ordered provider-neutral runtime events.
pub trait RuntimeEventSink: Send + Sync {
    fn emit(&self, event: RuntimeEvent);
}

/// Event sink used when the caller does not need streaming observations.
#[derive(Default)]
pub struct NoopEventSink;

impl RuntimeEventSink for NoopEventSink {
    fn emit(&self, _event: RuntimeEvent) {}
}
