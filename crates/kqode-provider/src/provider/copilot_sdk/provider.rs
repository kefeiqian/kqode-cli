use std::time::Duration;

use github_copilot_sdk::subscription::RecvErrorKind;
use github_copilot_sdk::types::MessageOptions;

use crate::inference::{
    ChatCancellationToken, ChatCompletion, ChatDeltaHandler, ChatError, ChatRequest,
};
use crate::provider::ProviderConfig;

use super::{config, events::EventState, request, runtime::CopilotSdkRuntime};

const CHAT_TIMEOUT: Duration = Duration::from_secs(600);
const ABORT_TIMEOUT: Duration = Duration::from_secs(10);
const DISCONNECT_TIMEOUT: Duration = Duration::from_secs(10);
const MODEL_LIST_TIMEOUT: Duration = Duration::from_secs(30);
const RUNTIME_START_TIMEOUT: Duration = Duration::from_secs(30);

pub(in crate::provider) struct CopilotSdkProvider<'a> {
    config: &'a ProviderConfig,
}

impl<'a> CopilotSdkProvider<'a> {
    pub(in crate::provider) fn new(config: &'a ProviderConfig) -> Self {
        Self { config }
    }

    pub(in crate::provider) async fn chat(
        &self,
        request: ChatRequest<'_>,
        cancellation: ChatCancellationToken,
        on_delta: Option<ChatDeltaHandler>,
    ) -> Result<ChatCompletion, ChatError> {
        if cancellation.is_cancelled() {
            return Err(ChatError::Cancelled);
        }
        let runtime_start = start_runtime();
        tokio::pin!(runtime_start);
        let runtime = tokio::select! {
            biased;
            () = cancellation.cancelled() => return Err(ChatError::Cancelled),
            result = &mut runtime_start => result?,
        };
        let result = self
            .chat_with_client(&runtime.client, request, cancellation, on_delta)
            .await;
        combine_cleanup(result, runtime.stop().await)
    }

    async fn chat_with_client(
        &self,
        client: &github_copilot_sdk::Client,
        request: ChatRequest<'_>,
        cancellation: ChatCancellationToken,
        on_delta: Option<ChatDeltaHandler>,
    ) -> Result<ChatCompletion, ChatError> {
        let create_session =
            client.create_session(config::session_config(&self.config.model, request.mode));
        tokio::pin!(create_session);
        let session = tokio::select! {
            biased;
            () = cancellation.cancelled() => return Err(ChatError::Cancelled),
            result = &mut create_session => result.map_err(|error| {
                ChatError::Request(format!("create GitHub Copilot SDK session: {error}"))
            })?,
        };
        let result = run_turn(
            &session,
            request::conversation_prompt(request.messages),
            &self.config.model,
            cancellation,
            on_delta,
        )
        .await;
        let disconnect = match tokio::time::timeout(DISCONNECT_TIMEOUT, session.disconnect()).await
        {
            Ok(result) => result.map_err(|error| {
                ChatError::Request(format!("disconnect GitHub Copilot SDK session: {error}"))
            }),
            Err(_) => Err(ChatError::Request(
                "disconnect GitHub Copilot SDK session timed out".to_owned(),
            )),
        };
        combine_cleanup(result, disconnect)
    }

    pub(in crate::provider) async fn list_models(&self) -> Result<Vec<String>, ChatError> {
        let runtime = start_runtime().await?;
        let result =
            match tokio::time::timeout(MODEL_LIST_TIMEOUT, runtime.client.list_models()).await {
                Ok(result) => result
                    .map(|models| {
                        let mut ids = models
                            .into_iter()
                            .map(|model| model.id)
                            .filter(|model| !model.trim().is_empty())
                            .collect::<Vec<_>>();
                        ids.sort_by_key(|model| model.to_lowercase());
                        ids.dedup();
                        ids
                    })
                    .map_err(|error| {
                        ChatError::Request(format!("list GitHub Copilot SDK models: {error}"))
                    }),
                Err(_) => Err(ChatError::Request(
                    "list GitHub Copilot SDK models timed out".to_owned(),
                )),
            };
        let result = result.and_then(|ids| {
            if ids.is_empty() {
                Err(ChatError::Response(
                    "GitHub Copilot SDK did not report any available models".to_owned(),
                ))
            } else {
                Ok(ids)
            }
        });
        combine_cleanup(result, runtime.stop().await)
    }
}

async fn start_runtime() -> Result<CopilotSdkRuntime, ChatError> {
    tokio::time::timeout(RUNTIME_START_TIMEOUT, CopilotSdkRuntime::start())
        .await
        .map_err(|_| {
            ChatError::Configuration("start GitHub Copilot SDK runtime timed out".to_owned())
        })?
}

async fn run_turn(
    session: &github_copilot_sdk::session::Session,
    prompt: String,
    fallback_model: &str,
    cancellation: ChatCancellationToken,
    on_delta: Option<ChatDeltaHandler>,
) -> Result<ChatCompletion, ChatError> {
    let mut subscription = session.subscribe();
    let send = session.send_and_wait(MessageOptions::new(prompt).with_wait_timeout(CHAT_TIMEOUT));
    tokio::pin!(send);
    let mut events = EventState::default();
    loop {
        tokio::select! {
            biased;
            () = cancellation.cancelled() => {
                return cancel_session(session).await;
            }
            event = subscription.recv() => {
                match event {
                    Ok(event) => events.observe(&event, on_delta.as_ref()),
                    Err(error) if matches!(error.kind(), RecvErrorKind::Lagged(_)) => {
                        return Err(ChatError::Response(format!(
                            "GitHub Copilot SDK event stream lost data: {error}"
                        )));
                    }
                    Err(error) => {
                        return Err(ChatError::Response(format!(
                            "GitHub Copilot SDK event stream closed: {error}"
                        )));
                    }
                }
            }
            result = &mut send => {
                let final_event = result.map_err(|error| {
                    ChatError::Request(format!("send GitHub Copilot SDK message: {error}"))
                })?;
                return events.finish(
                    final_event,
                    fallback_model,
                    on_delta.as_ref(),
                );
            }
        }
    }
}

async fn cancel_session(
    session: &github_copilot_sdk::session::Session,
) -> Result<ChatCompletion, ChatError> {
    match tokio::time::timeout(ABORT_TIMEOUT, session.abort()).await {
        Ok(Ok(())) => Err(ChatError::Cancelled),
        Ok(Err(error)) => Err(ChatError::Request(format!(
            "LLM request was stopped, but aborting the GitHub Copilot SDK session failed: {error}"
        ))),
        Err(_) => Err(ChatError::Request(
            "LLM request was stopped, but aborting the GitHub Copilot SDK session timed out"
                .to_owned(),
        )),
    }
}

fn combine_cleanup<T>(
    result: Result<T, ChatError>,
    cleanup: Result<(), ChatError>,
) -> Result<T, ChatError> {
    match (result, cleanup) {
        (Ok(value), Ok(())) => Ok(value),
        (Ok(_), Err(error)) => Err(error),
        (Err(error), Ok(())) => Err(error),
        (Err(error), Err(cleanup)) => Err(ChatError::Request(format!(
            "{error}; cleanup also failed: {cleanup}"
        ))),
    }
}

#[cfg(test)]
mod tests {
    use super::combine_cleanup;
    use crate::inference::ChatError;

    #[test]
    fn cleanup_failure_is_not_hidden_by_a_successful_request() {
        let result = combine_cleanup(
            Ok("answer"),
            Err(ChatError::Request("cleanup failed".to_owned())),
        );

        assert_eq!(result.unwrap_err().to_string(), "cleanup failed");
    }
}
