use super::*;

#[test]
fn done_sentinel_maps_to_done() {
    assert_eq!(
        parse_chunk("[DONE]").unwrap(),
        Some(StreamEvent::Done {
            finish_reason: None
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
            finish_reason: Some("stop".to_owned())
        })
    );
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
