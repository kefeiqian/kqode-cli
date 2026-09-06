use super::*;
use crate::provider::models::{ValidationOutcome, parse_models_response};
use crate::provider::registry::{
    CredentialSource, KeySource, ProviderStatus, derive_status, validate_base_url,
};
use crate::provider::{ChatMessage, Sampling, Usage};
use crate::provider::{ModelInfo, ProviderId};

#[test]
fn done_sentinel_maps_to_done() {
    assert_eq!(
        parse_chunk("[DONE]").unwrap(),
        Some(StreamEvent::Done {
            finish_reason: None,
            usage: None,
        })
    );
}

#[test]
fn content_delta_is_extracted() {
    let data = r#"{"choices":[{"delta":{"content":"Hello"}}]}"#;
    assert_eq!(
        parse_chunk(data).unwrap(),
        Some(StreamEvent::Delta("Hello".to_owned()))
    );
}

#[test]
fn finish_reason_chunk_maps_to_done() {
    let data = r#"{"choices":[{"delta":{},"finish_reason":"stop"}]}"#;
    assert_eq!(
        parse_chunk(data).unwrap(),
        Some(StreamEvent::Done {
            finish_reason: Some("stop".to_owned()),
            usage: None,
        })
    );
}

#[test]
fn usage_only_chunk_maps_to_usage_done() {
    let data = r#"{"choices":[],"usage":{"prompt_tokens":12,"completion_tokens":34}}"#;
    assert_eq!(
        parse_chunk(data).unwrap(),
        Some(StreamEvent::Done {
            finish_reason: None,
            usage: Some(Usage {
                input: 12,
                output: 34,
            }),
        })
    );
}

#[test]
fn request_body_includes_sampling_and_usage_when_set() {
    let request = ProviderRequest {
        model: "m".to_owned(),
        messages: vec![ChatMessage::user("hi")],
        sampling: Sampling {
            temperature: Some(0.0),
            seed: Some(7),
        },
        include_usage: true,
    };
    let body = request_body("m", &request);
    assert_eq!(body["temperature"].as_f64(), Some(0.0));
    assert_eq!(body["seed"].as_u64(), Some(7));
    assert_eq!(
        body["stream_options"]["include_usage"].as_bool(),
        Some(true)
    );
}

#[test]
fn request_body_omits_sampling_and_usage_by_default() {
    let request = ProviderRequest {
        model: "m".to_owned(),
        messages: vec![ChatMessage::user("hi")],
        sampling: Sampling::default(),
        include_usage: false,
    };
    let body = request_body("m", &request);
    assert!(body.get("temperature").is_none());
    assert!(body.get("seed").is_none());
    assert!(body.get("stream_options").is_none());
}

#[test]
fn role_only_and_empty_chunks_are_dropped() {
    let role_only = r#"{"choices":[{"delta":{"role":"assistant"}}]}"#;
    assert_eq!(parse_chunk(role_only).unwrap(), None);
    assert_eq!(parse_chunk("").unwrap(), None);
}

#[test]
fn malformed_json_is_a_decode_error() {
    assert!(matches!(
        parse_chunk("{not json"),
        Err(ProviderError::Decode(_))
    ));
}

#[test]
fn status_codes_classify_into_kinds() {
    assert_eq!(classify_status(401), ProviderError::Auth);
    assert_eq!(classify_status(403), ProviderError::Auth);
    assert_eq!(classify_status(429), ProviderError::RateLimit);
    assert!(matches!(classify_status(500), ProviderError::Network(_)));
}

#[test]
fn http_error_detail_appends_body_snippet() {
    assert_eq!(http_error_detail(400, ""), "HTTP 400");
    assert_eq!(http_error_detail(400, "  \n "), "HTTP 400");
    assert_eq!(
        http_error_detail(400, "  invalid temperature  "),
        "HTTP 400: invalid temperature"
    );
    let long = "x".repeat(500);
    let detail = http_error_detail(400, &long);
    assert_eq!(detail.chars().count(), "HTTP 400: ".len() + 300);
}

#[test]
fn validation_outcome_maps_status_codes() {
    assert_eq!(
        ValidationOutcome::from_response(401, "{}"),
        ValidationOutcome::AuthFailed
    );
    assert_eq!(
        ValidationOutcome::from_response(403, "{}"),
        ValidationOutcome::AuthFailed
    );
    assert_eq!(
        ValidationOutcome::from_response(429, "{}"),
        ValidationOutcome::RateLimited
    );
    assert_eq!(
        ValidationOutcome::from_response(500, "{}"),
        ValidationOutcome::Unreachable
    );
}

#[test]
fn parse_models_response_preserves_ids_in_order() {
    let body = r#"{
        "object": "list",
        "data": [
            { "id": "kimi-k2.7-code", "object": "model", "owned_by": "moonshot" },
            { "id": "kimi-latest", "object": "model" }
        ]
    }"#;

    assert_eq!(
        parse_models_response(body).unwrap(),
        vec![
            ModelInfo {
                id: "kimi-k2.7-code".to_owned(),
                owned_by: Some("moonshot".to_owned()),
            },
            ModelInfo {
                id: "kimi-latest".to_owned(),
                owned_by: None,
            },
        ]
    );
}

#[test]
fn validation_rejects_non_openai_catalogs() {
    assert_eq!(
        ValidationOutcome::from_response(200, r#"{"models":[]}"#),
        ValidationOutcome::NotCompatible
    );
    assert_eq!(
        ValidationOutcome::from_response(200, "{not json"),
        ValidationOutcome::NotCompatible
    );
}

#[test]
fn validation_treats_empty_catalog_as_not_connected() {
    assert_eq!(
        ValidationOutcome::from_response(200, r#"{"data":[]}"#),
        ValidationOutcome::EmptyCatalog
    );
}

#[test]
fn non_https_base_url_is_rejected() {
    let config = KimiConfig {
        api_key: "token".to_owned(),
        model: "kimi-k2.7-code".to_owned(),
        base_url: "http://localhost:1234/v1".to_owned(),
    };
    assert!(matches!(
        KimiProvider::new(config),
        Err(ProviderError::Config(_))
    ));
}

#[test]
fn https_base_url_builds_a_client() {
    let config = KimiConfig {
        api_key: "token".to_owned(),
        model: "kimi-k2.7-code".to_owned(),
        base_url: "https://api.moonshot.cn/v1".to_owned(),
    };
    assert!(KimiProvider::new(config).is_ok());
}

#[test]
fn base_url_validation_parses_and_normalizes() {
    assert_eq!(
        validate_base_url("https://api.example.com/v1/").unwrap(),
        "https://api.example.com/v1"
    );
    assert!(matches!(
        validate_base_url("http://api.example.com/v1"),
        Err(ProviderError::Config(_))
    ));
    assert!(matches!(
        validate_base_url("https://user:pass@api.example.com/v1"),
        Err(ProviderError::Config(_))
    ));
    assert!(matches!(
        validate_base_url("https://"),
        Err(ProviderError::Config(_))
    ));
}

#[test]
fn status_derivation_uses_key_resolver_source() {
    let keychain = |provider: ProviderId| match provider {
        ProviderId::Kimi => KeySource::Keychain,
        ProviderId::Custom => KeySource::None,
    };
    let none = |_provider: ProviderId| KeySource::None;

    assert_eq!(
        derive_status(ProviderId::Kimi, &keychain),
        ProviderStatus::Connected(CredentialSource::Keychain)
    );
    assert_eq!(
        derive_status(ProviderId::Kimi, &none),
        ProviderStatus::NotConfigured
    );
}
