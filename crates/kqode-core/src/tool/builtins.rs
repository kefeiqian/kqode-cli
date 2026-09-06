use std::sync::Arc;

use serde_json::{Value, json};

use crate::cancellation::CancellationToken;

use super::{
    ToolCall, ToolDefinition, ToolEffects, ToolExecutionMode, ToolExposure, ToolHandler,
    ToolHandlerFuture, ToolInvocation, ToolLimits, ToolResult, ToolSource,
};

pub(super) fn definitions() -> Vec<(ToolDefinition, Arc<dyn ToolHandler>)> {
    vec![
        fake_tool(
            "run_command",
            "Run command",
            "Run one noninteractive foreground command in the selected workspace.",
            json!({
                "type": "object",
                "properties": {
                    "command": {"type": "string", "minLength": 1},
                    "cwd": {"type": "string", "minLength": 1},
                    "timeout_ms": {"type": "integer", "minimum": 1}
                },
                "required": ["command"],
                "additionalProperties": false
            }),
            ToolEffects {
                process: true,
                filesystem_read: true,
                filesystem_write: true,
                ..ToolEffects::default()
            },
        ),
        fake_tool(
            "fetch_web_url",
            "Fetch web URL",
            "Fetch one HTTP(S) URL through the runtime's controlled network client.",
            json!({
                "type": "object",
                "properties": {
                    "url": {"type": "string", "minLength": 1}
                },
                "required": ["url"],
                "additionalProperties": false
            }),
            ToolEffects {
                network: true,
                ..ToolEffects::default()
            },
        ),
        fake_tool(
            "ask_user",
            "Ask user",
            "Ask the user for missing information or a decision before continuing.",
            json!({
                "type": "object",
                "properties": {
                    "questions": {
                        "type": "array",
                        "minItems": 1,
                        "items": {
                            "type": "object",
                            "properties": {
                                "id": {"type": "string", "minLength": 1},
                                "question": {"type": "string", "minLength": 1},
                                "header": {"type": "string"},
                                "options": {
                                    "type": "array",
                                    "items": {
                                        "type": "object",
                                        "properties": {
                                            "label": {"type": "string", "minLength": 1},
                                            "description": {"type": "string"}
                                        },
                                        "required": ["label"],
                                        "additionalProperties": false
                                    }
                                },
                                "multi_select": {"type": "boolean"}
                            },
                            "required": ["id", "question"],
                            "additionalProperties": false
                        }
                    }
                },
                "required": ["questions"],
                "additionalProperties": false
            }),
            ToolEffects {
                user_interaction: true,
                ..ToolEffects::default()
            },
        ),
    ]
}

fn fake_tool(
    canonical_name: &str,
    display_name: &str,
    description: &str,
    input_schema: Value,
    effects: ToolEffects,
) -> (ToolDefinition, Arc<dyn ToolHandler>) {
    (
        ToolDefinition {
            canonical_name: canonical_name.to_owned(),
            display_name: display_name.to_owned(),
            description: description.to_owned(),
            input_schema,
            effects,
            exposure: ToolExposure::Direct,
            execution_mode: ToolExecutionMode::Sequential,
            limits: ToolLimits::default(),
            source: ToolSource::Builtin,
        },
        Arc::new(UnavailableHandler),
    )
}

struct UnavailableHandler;

impl ToolHandler for UnavailableHandler {
    fn invoke<'a>(
        &'a self,
        invocation: &'a ToolInvocation,
        cancellation: &'a CancellationToken,
    ) -> ToolHandlerFuture<'a> {
        Box::pin(async move {
            let call = ToolCall {
                id: invocation.call_id.clone(),
                canonical_name: invocation.canonical_name.clone(),
                arguments: invocation.arguments.clone(),
                argument_error: None,
            };
            if cancellation.is_cancelled() {
                return ToolResult::failure(
                    &call,
                    super::ToolCallError {
                        kind: super::ToolErrorKind::Cancelled,
                        message: "Tool invocation was cancelled".to_owned(),
                    },
                );
            }
            ToolResult::failure(
                &call,
                super::ToolCallError {
                    kind: super::ToolErrorKind::Unavailable,
                    message: format!(
                        "Tool `{}` has no production handler in this build",
                        invocation.canonical_name
                    ),
                },
            )
        })
    }
}
