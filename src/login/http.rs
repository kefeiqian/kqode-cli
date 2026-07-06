use std::time::Duration;

use futures_util::StreamExt;
use reqwest::redirect::Policy;

use crate::provider::ValidationOutcome;
use crate::secrets::ApiKey;

const HTTP_TIMEOUT: Duration = Duration::from_secs(8);
const CONNECT_TIMEOUT: Duration = Duration::from_secs(8);
const MODELS_BODY_CAP_BYTES: u64 = 256 * 1024;

pub(super) async fn fetch_models(base_url: &str, key: &ApiKey) -> ValidationOutcome {
    match fetch_models_body(base_url, key).await {
        Ok((status, body)) => ValidationOutcome::from_response(status, &body),
        Err(FetchError::TooLarge) => ValidationOutcome::NotCompatible,
        Err(FetchError::Network) => ValidationOutcome::Unreachable,
    }
}

async fn fetch_models_body(base_url: &str, key: &ApiKey) -> Result<(u16, String), FetchError> {
    let client = reqwest::Client::builder()
        .redirect(Policy::none())
        .connect_timeout(CONNECT_TIMEOUT)
        .timeout(HTTP_TIMEOUT)
        .build()
        .map_err(|_| FetchError::Network)?;
    let response = client
        .get(format!("{base_url}/models"))
        .bearer_auth(key.expose())
        .send()
        .await
        .map_err(|_| FetchError::Network)?;
    if response
        .content_length()
        .is_some_and(|length| length > MODELS_BODY_CAP_BYTES)
    {
        return Err(FetchError::TooLarge);
    }
    let status = response.status().as_u16();
    let mut body = Vec::new();
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|_| FetchError::Network)?;
        if body.len() + chunk.len() > MODELS_BODY_CAP_BYTES as usize {
            return Err(FetchError::TooLarge);
        }
        body.extend_from_slice(&chunk);
    }
    String::from_utf8(body)
        .map(|body| (status, body))
        .map_err(|_| FetchError::TooLarge)
}

enum FetchError {
    Network,
    TooLarge,
}
