use crate::{inference::ChatError, settings::Provider};

pub(super) fn validate_selection(
    provider: Option<Provider>,
    model: Option<&str>,
) -> Result<(Provider, String), ChatError> {
    let provider = provider.ok_or_else(|| {
        ChatError::Configuration("select a provider before sending a message".to_owned())
    })?;
    let model = model.unwrap_or_default().trim().to_owned();
    if provider.requires_model() && model.is_empty() {
        return Err(ChatError::Configuration(
            "select a model before sending a message".to_owned(),
        ));
    }
    Ok((provider, model))
}
