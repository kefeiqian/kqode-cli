//! Chat-turn orchestration: system prompt construction and the streaming turn
//! runner that bridges the synchronous backend loop to the async provider.

pub mod compaction_plan;
pub mod context_budget;
pub mod request;
pub mod system_prompt;
pub mod token_estimate;
pub mod turn;
pub mod types;

pub use request::{CompactionState, HistoryRound, assemble};
pub use turn::{run_streaming_turn, spawn_streaming_turn};
pub use types::{CancellationToken, TurnStreamEvent};
