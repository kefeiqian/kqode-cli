use serde::{Deserialize, Serialize};

use super::CommandContext;

/// A policy decision, independent of the backend's ability to enforce permissions.
#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum PolicyDecision {
    Allow,
    Ask,
    Deny,
}

impl PolicyDecision {
    /// Combines trusted per-segment decisions for one complete command.
    ///
    /// Any deny wins. Incomplete parsing, no segments, or any ask requires fresh
    /// approval. This helper is not a parser and must not receive model assertions.
    pub fn combine(segments: &[Self], fully_parsed: bool) -> Self {
        if segments.contains(&Self::Deny) {
            Self::Deny
        } else if !fully_parsed || segments.is_empty() || segments.contains(&Self::Ask) {
            Self::Ask
        } else {
            Self::Allow
        }
    }
}

/// Trusted host policy that evaluates the original script and frozen launch context.
///
/// Implementations must treat parser failure as ask/deny and reject the entire
/// command if any segment is denied. A caller must not supply model-generated
/// policy verdicts as an implementation of this boundary.
pub trait CommandPolicy: Send + Sync {
    fn evaluate(&self, context: &CommandContext) -> PolicyDecision;
}

/// Conservative production default until platform command analysis is implemented.
#[derive(Clone, Copy, Debug, Default)]
pub struct RequireApproval;

impl CommandPolicy for RequireApproval {
    fn evaluate(&self, _context: &CommandContext) -> PolicyDecision {
        PolicyDecision::Ask
    }
}
