use std::{future::Future, pin::Pin};

use serde::{Deserialize, Serialize};

use crate::cancellation::CancellationToken;

use super::{ModelRequest, ModelStep};

/// Future returned by a provider-neutral model adapter.
pub type ModelProviderFuture<'a> =
    Pin<Box<dyn Future<Output = Result<ModelStep, ModelProviderError>> + Send + 'a>>;

/// Produces normalized model steps from provider-neutral requests.
pub trait ModelProvider: Send + Sync {
    fn request<'a>(
        &'a self,
        request: ModelRequest,
        cancellation: CancellationToken,
    ) -> ModelProviderFuture<'a>;
}

/// Category of provider failure visible to the runtime.
#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ModelProviderErrorKind {
    Request,
    Response,
    Cancelled,
}

/// Typed provider failure without provider-native payloads.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct ModelProviderError {
    pub kind: ModelProviderErrorKind,
    pub message: String,
}

impl ModelProviderError {
    /// Creates a provider failure.
    pub fn new(kind: ModelProviderErrorKind, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
        }
    }
}

impl std::fmt::Display for ModelProviderError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl std::error::Error for ModelProviderError {}
