//! Proposal-only extraction worker contract (U6).
//!
//! Extraction workers never mutate memory truth (KTD12); they return structured
//! proposals that the backend validates, redacts, scopes, audits, and commits.
//! This slice ships the contract plus a deterministic mock; provider-backed
//! extraction is deferred behind this trait so privacy/cost/cancellation policy
//! can be settled later (KTD10, Scope Boundaries).

use super::{MemoryScope, MemoryType};

/// One settled, completed round considered for extraction.
#[derive(Clone, Debug)]
pub struct ExtractionRound {
    pub seq: u64,
    pub prompt: String,
    pub response: String,
}

/// The eligible settled rounds for one session, passed to a worker.
#[derive(Clone, Debug)]
pub struct ExtractionInput {
    pub session_id: String,
    pub rounds: Vec<ExtractionRound>,
}

/// A memory a worker proposes. Never written directly — the backend commits it.
#[derive(Clone, Debug)]
pub struct MemoryProposal {
    pub scope: MemoryScope,
    pub memory_type: MemoryType,
    pub title: String,
    pub body: String,
    /// Confidence in `0.0..=1.0`; low confidence yields an inactive candidate.
    pub confidence: f64,
}

/// Proposal-only outcome; the backend validates, scopes, audits, and commits it.
#[derive(Clone, Debug)]
pub enum ExtractionOutcome {
    /// Nothing worth remembering.
    NoOp,
    /// An inactive candidate for review.
    Candidate(MemoryProposal),
    /// A high-confidence active update (activation/audit handled downstream).
    ActiveUpdate(MemoryProposal),
    /// Secret-shaped content was detected; nothing is proposed.
    BlockedSensitive,
    /// The worker failed; diagnostics are recorded and no memory is written.
    Failed(String),
}

/// A worker that proposes memory from settled rounds. Implementations must not
/// touch the filesystem or memory truth.
pub trait Extractor: Send + Sync {
    fn extract(&self, input: &ExtractionInput) -> ExtractionOutcome;
}

/// An extractor that always no-ops — the default while provider-backed
/// extraction is disabled.
pub struct NoopExtractor;

impl Extractor for NoopExtractor {
    fn extract(&self, _input: &ExtractionInput) -> ExtractionOutcome {
        ExtractionOutcome::NoOp
    }
}

/// A deterministic extractor driven by a closure, for tests and future
/// rule-based experimentation.
pub struct RuleExtractor<F>(pub F);

impl<F> Extractor for RuleExtractor<F>
where
    F: Fn(&ExtractionInput) -> ExtractionOutcome + Send + Sync,
{
    fn extract(&self, input: &ExtractionInput) -> ExtractionOutcome {
        (self.0)(input)
    }
}
