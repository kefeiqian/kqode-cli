//! Chat-turn orchestration: system prompt construction and the streaming turn
//! runner that bridges the synchronous backend loop to the async provider.

mod agents_md;
pub mod compaction;
pub mod compaction_plan;
pub mod context_budget;
pub mod oneshot;
pub mod request;
pub mod session_summary;
pub mod summarize;
pub mod system_prompt;
pub mod token_estimate;
pub mod turn;
pub mod types;

pub use oneshot::{Completion, run_oneshot};
pub use request::{CompactionState, HistoryRound, assemble};
pub use session_summary::{generate_session_summary, sanitize_session_title};
pub use turn::{run_streaming_turn, spawn_streaming_turn};
pub use types::{CancellationToken, TurnStreamEvent};
