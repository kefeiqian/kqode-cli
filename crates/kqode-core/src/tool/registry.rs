use std::sync::Arc;

use crate::cancellation::CancellationToken;

use super::RegistryError;
use super::{
    ToolCall, ToolCallError, ToolDefinition, ToolErrorKind, ToolExposure, ToolHandler,
    ToolInvocation, ToolResult, builtins, validation,
};

struct RegisteredTool {
    definition: ToolDefinition,
    handler: Arc<dyn ToolHandler>,
}

/// Mutable registration surface used before a runtime step begins.
#[derive(Default)]
pub struct ToolRegistry {
    generation: u64,
    tools: Vec<RegisteredTool>,
}

impl ToolRegistry {
    /// Creates an empty registry.
    pub fn new() -> Self {
        Self::default()
    }

    /// Creates the three canonical tools with fail-closed placeholder handlers.
    pub fn builtins() -> Self {
        let mut registry = Self::new();
        for (definition, handler) in builtins::definitions() {
            registry
                .register(definition, handler)
                .expect("builtin tool definitions must be unique and valid");
        }
        registry
    }

    /// Registers one definition and its sole handler.
    ///
    /// # Errors
    ///
    /// Returns an error for an empty or duplicate canonical name.
    pub fn register(
        &mut self,
        definition: ToolDefinition,
        handler: Arc<dyn ToolHandler>,
    ) -> Result<(), RegistryError> {
        let canonical_name = definition.canonical_name.trim();
        if canonical_name.is_empty() {
            return Err(RegistryError::EmptyCanonicalName);
        }
        if canonical_name != definition.canonical_name {
            return Err(RegistryError::InvalidCanonicalName(
                definition.canonical_name,
            ));
        }
        if self
            .tools
            .iter()
            .any(|tool| tool.definition.canonical_name == canonical_name)
        {
            return Err(RegistryError::DuplicateCanonicalName(
                canonical_name.to_owned(),
            ));
        }
        self.tools.push(RegisteredTool {
            definition,
            handler,
        });
        self.generation += 1;
        Ok(())
    }

    /// Freezes the current registrations for one or more model steps.
    pub fn snapshot(&self) -> ToolExposureSnapshot {
        ToolExposureSnapshot {
            generation: self.generation,
            tools: Arc::from(
                self.tools
                    .iter()
                    .map(|tool| SnapshotTool {
                        definition: tool.definition.clone(),
                        handler: Arc::clone(&tool.handler),
                    })
                    .collect::<Vec<_>>(),
            ),
        }
    }

    /// Returns the definitions exposed directly to the current model path.
    pub fn definitions(&self) -> Vec<ToolDefinition> {
        self.snapshot().definitions()
    }
}

struct SnapshotTool {
    definition: ToolDefinition,
    handler: Arc<dyn ToolHandler>,
}

/// Immutable tool definitions and handlers used for one model step.
#[derive(Clone)]
pub struct ToolExposureSnapshot {
    generation: u64,
    tools: Arc<[SnapshotTool]>,
}

impl ToolExposureSnapshot {
    /// Returns the registry generation captured by this snapshot.
    pub fn generation(&self) -> u64 {
        self.generation
    }

    /// Returns only definitions that may be serialized to the model.
    pub fn definitions(&self) -> Vec<ToolDefinition> {
        self.tools
            .iter()
            .filter(|tool| tool.definition.exposure == ToolExposure::Direct)
            .map(|tool| tool.definition.clone())
            .collect()
    }

    /// Validates a model call against this exact snapshot.
    ///
    /// # Errors
    ///
    /// Returns a correlated recoverable error for unknown, hidden, deferred, or
    /// schema-invalid calls.
    pub fn validate_call(&self, call: &ToolCall) -> Result<(), ToolCallError> {
        let tool = self.resolve(&call.canonical_name)?;
        if let Some(error) = &call.argument_error {
            return Err(ToolCallError {
                kind: ToolErrorKind::InvalidArguments,
                message: format!(
                    "Invalid arguments for `{}`: {}",
                    call.canonical_name, error.message
                ),
            });
        }
        validation::validate(&tool.definition.input_schema, &call.arguments).map_err(|message| {
            ToolCallError {
                kind: ToolErrorKind::InvalidArguments,
                message: format!("Invalid arguments for `{}`: {message}", call.canonical_name),
            }
        })
    }

    /// Validates and dispatches one invocation through the bound handler.
    pub async fn invoke(
        &self,
        invocation: &ToolInvocation,
        cancellation: &CancellationToken,
    ) -> ToolResult {
        let call = ToolCall {
            id: invocation.call_id.clone(),
            canonical_name: invocation.canonical_name.clone(),
            arguments: invocation.arguments.clone(),
            argument_error: None,
        };
        if cancellation.is_cancelled() {
            return ToolResult::failure(
                &call,
                ToolCallError {
                    kind: ToolErrorKind::Cancelled,
                    message: "Tool invocation was cancelled".to_owned(),
                },
            );
        }
        let tool = match self.resolve(&invocation.canonical_name) {
            Ok(tool) => tool,
            Err(error) => return ToolResult::failure(&call, error),
        };
        if let Err(message) =
            validation::validate(&tool.definition.input_schema, &invocation.arguments)
        {
            return ToolResult::failure(
                &call,
                ToolCallError {
                    kind: ToolErrorKind::InvalidArguments,
                    message: format!(
                        "Invalid arguments for `{}`: {message}",
                        invocation.canonical_name
                    ),
                },
            );
        }
        tool.handler.invoke(invocation, cancellation).await
    }

    fn resolve(&self, name: &str) -> Result<&SnapshotTool, ToolCallError> {
        let Some(tool) = self
            .tools
            .iter()
            .find(|tool| tool.definition.canonical_name == name)
        else {
            return Err(ToolCallError {
                kind: ToolErrorKind::UnknownTool,
                message: format!("Unknown tool: {name}"),
            });
        };
        match tool.definition.exposure {
            ToolExposure::Direct => Ok(tool),
            ToolExposure::Hidden | ToolExposure::Deferred => Err(ToolCallError {
                kind: ToolErrorKind::HiddenTool,
                message: format!("Tool `{name}` is not exposed in this step"),
            }),
        }
    }
}
