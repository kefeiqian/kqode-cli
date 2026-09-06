mod constants;
mod error;
mod facade;
mod lifecycle;
mod message_stream;
mod messaging;
mod queue_controls;
mod state;
mod title;
mod transcript;
mod turn_runner;
mod update;

#[cfg(test)]
mod tests;

pub(crate) use error::ConversationServiceError;
pub(crate) use facade::ConversationService;
pub(crate) use lifecycle::{
    archive_conversation, create_conversation, list_conversations, load_conversation,
};
pub(crate) use message_stream::{ConversationMessageStream, ConversationMessageStreamHandler};
pub(crate) use messaging::{retry_message, send_message};
pub(crate) use queue_controls::{SteerTurnResult, delete_turn, steer_turn};
pub(crate) use title::{TitleGenerationRequest, generate_conversation_title};
pub(crate) use turn_runner::{SendMessageResult, process_pending_turn};
pub(crate) use update::update_conversation;
