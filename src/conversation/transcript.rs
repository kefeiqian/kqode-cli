use crate::protocol::{TURN_STATE_ACTIVE, TURN_STATE_PENDING};

/// Lifecycle state for an in-memory transcript turn.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum TurnState {
    Pending,
    Active,
    Settled,
}

impl TurnState {
    /// Returns the wire-compatible state name used by queue events.
    #[must_use]
    pub const fn as_queue_state(self) -> Option<&'static str> {
        match self {
            Self::Active => Some(TURN_STATE_ACTIVE),
            Self::Pending => Some(TURN_STATE_PENDING),
            Self::Settled => None,
        }
    }
}

/// Terminal result class for a turn.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum SettledKind {
    Completed,
    NeedsConfiguration,
    Error,
    Cancelled,
}

/// Domain result stored in the transcript and emitted on settle.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TurnResult {
    pub kind: SettledKind,
    pub text: Option<String>,
    pub finish_reason: Option<String>,
    pub error_kind: Option<String>,
    pub message: Option<String>,
}

impl TurnResult {
    #[must_use]
    pub fn completed(text: String, finish_reason: Option<String>) -> Self {
        Self {
            kind: SettledKind::Completed,
            text: Some(text),
            finish_reason,
            error_kind: None,
            message: None,
        }
    }

    #[must_use]
    pub fn needs_configuration(message: impl Into<String>) -> Self {
        Self {
            kind: SettledKind::NeedsConfiguration,
            text: None,
            finish_reason: None,
            error_kind: Some("needsConfiguration".to_owned()),
            message: Some(message.into()),
        }
    }

    #[must_use]
    pub fn error(kind: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            kind: SettledKind::Error,
            text: None,
            finish_reason: None,
            error_kind: Some(kind.into()),
            message: Some(message.into()),
        }
    }

    #[must_use]
    pub fn cancelled() -> Self {
        Self {
            kind: SettledKind::Cancelled,
            text: None,
            finish_reason: None,
            error_kind: Some("cancelled".to_owned()),
            message: Some("turn cancelled".to_owned()),
        }
    }
}

#[derive(Clone, Debug)]
pub struct TranscriptTurn {
    pub turn_id: String,
    pub seq: u64,
    pub prompt: String,
    pub state: TurnState,
    pub result: Option<TurnResult>,
}

/// Ordered in-memory transcript for one backend process.
#[derive(Debug, Default)]
pub struct Transcript {
    turns: Vec<TranscriptTurn>,
    next_seq: u64,
}

impl Transcript {
    /// Appends a turn using `state` as its initial queue state.
    pub fn push(&mut self, turn_id: String, prompt: String, state: TurnState) -> u64 {
        let seq = self.next_seq;
        self.next_seq += 1;
        self.turns.push(TranscriptTurn {
            turn_id,
            seq,
            prompt,
            state,
            result: None,
        });
        seq
    }

    #[must_use]
    pub fn has_active(&self) -> bool {
        self.turns
            .iter()
            .any(|turn| turn.state == TurnState::Active)
    }

    #[must_use]
    pub fn active_id(&self) -> Option<&str> {
        self.turns
            .iter()
            .find(|turn| turn.state == TurnState::Active)
            .map(|turn| turn.turn_id.as_str())
    }

    pub fn settle_active(&mut self, turn_id: &str, result: TurnResult) -> bool {
        let Some(turn) = self
            .turns
            .iter_mut()
            .find(|turn| turn.state == TurnState::Active)
        else {
            return false;
        };
        if turn.turn_id != turn_id {
            return false;
        }
        turn.state = TurnState::Settled;
        turn.result = Some(result);
        true
    }

    pub fn activate_next_pending(&mut self) -> Option<String> {
        let turn = self
            .turns
            .iter_mut()
            .find(|turn| turn.state == TurnState::Pending)?;
        turn.state = TurnState::Active;
        Some(turn.turn_id.clone())
    }

    pub fn drop_pending(&mut self) {
        self.turns.retain(|turn| turn.state != TurnState::Pending);
    }

    #[must_use]
    pub fn turns(&self) -> &[TranscriptTurn] {
        &self.turns
    }
}
