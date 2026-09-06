use futures_util::StreamExt;
use reqwest::{Response, header::CONTENT_TYPE};

use crate::inference::{ChatCancellationToken, ChatError};

use super::sse::{SseDecoder, SseEvent};

pub(in crate::provider) fn is_event_stream(response: &Response) -> bool {
    response
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.split(';').next())
        .is_some_and(|value| value.trim().eq_ignore_ascii_case("text/event-stream"))
}

pub(in crate::provider) async fn consume_sse(
    response: Response,
    cancellation: ChatCancellationToken,
    mut consume: impl FnMut(SseEvent) -> Result<bool, ChatError>,
) -> Result<(), ChatError> {
    let mut bytes = response.bytes_stream();
    let mut decoder = SseDecoder::default();
    loop {
        let next = tokio::select! {
            biased;
            () = cancellation.cancelled() => return Err(ChatError::Cancelled),
            next = bytes.next() => next,
        };
        let Some(chunk) = next else {
            break;
        };
        let chunk =
            chunk.map_err(|error| ChatError::Response(format!("read LLM stream: {error}")))?;
        if consume_events(decoder.push(&chunk)?, &mut consume)? {
            return Ok(());
        }
    }
    consume_events(decoder.finish()?, &mut consume)?;
    Ok(())
}

fn consume_events(
    events: Vec<SseEvent>,
    consume: &mut impl FnMut(SseEvent) -> Result<bool, ChatError>,
) -> Result<bool, ChatError> {
    for event in events {
        if !event.data.trim().is_empty() && consume(event)? {
            return Ok(true);
        }
    }
    Ok(false)
}
