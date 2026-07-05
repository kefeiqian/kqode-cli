//! Chat-turn orchestration: system prompt construction and the streaming turn
//! runner that bridges the synchronous backend loop to the async provider.

pub mod system_prompt;
pub mod turn;

pub use turn::spawn_streaming_turn;
