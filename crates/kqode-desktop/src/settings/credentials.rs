use super::LlmSettings;

pub(super) fn serialize_empty_api_key<S>(_: &str, serializer: S) -> Result<S::Ok, S::Error>
where
    S: serde::Serializer,
{
    serializer.serialize_str("")
}

pub(super) fn redact_api_key(api_key: &str) -> String {
    let characters = api_key.chars().collect::<Vec<_>>();
    if characters.is_empty() {
        return String::new();
    }
    if characters.len() <= 8 {
        return "[redacted]".to_owned();
    }
    format!(
        "{}[redacted]{}",
        characters[..4].iter().collect::<String>(),
        characters[characters.len() - 4..]
            .iter()
            .collect::<String>()
    )
}

pub(super) fn api_key_preview(api_key: &str) -> String {
    redact_api_key(api_key)
}

pub(super) fn normalized_url(settings: &LlmSettings) -> &str {
    settings.api_base_url.trim().trim_end_matches('/')
}

pub(super) fn preserved_or_new_api_key(
    settings: &LlmSettings,
    previous: Option<&(String, String)>,
) -> String {
    previous
        .filter(|(api_base_url, api_key)| {
            settings.api_key.trim().is_empty()
                && api_base_url.trim().trim_end_matches('/') == normalized_url(settings)
                && settings.api_key_preview == redact_api_key(api_key.trim())
        })
        .map(|(_, api_key)| api_key.trim().to_owned())
        .unwrap_or_else(|| settings.api_key.trim().to_owned())
}

pub(super) fn resolve_submitted_api_key(
    settings: &LlmSettings,
    previous_api_base_url: &str,
    previous_api_key: &str,
) -> String {
    preserved_or_new_api_key(
        settings,
        Some(&(
            previous_api_base_url.to_owned(),
            previous_api_key.to_owned(),
        )),
    )
}
