use github_copilot_sdk::{
    Error, ToolResult,
    mode::ToolSet,
    tool::define_tool,
    types::{Tool, ToolInvocation, ToolResultExpanded},
};
use serde_json::Value;

use crate::tools::ToolDefinition;

pub(super) fn declarations(descriptions: &[ToolDefinition]) -> Vec<Tool> {
    descriptions
        .iter()
        .map(|description| {
            define_tool(
                description.canonical_name.clone(),
                description.description.clone(),
                unavailable_tool,
            )
            .with_parameters(description.input_schema.clone())
            .with_overrides_built_in_tool(true)
        })
        .collect()
}

pub(super) fn available_tool_names(descriptions: &[ToolDefinition]) -> Vec<String> {
    descriptions
        .iter()
        .fold(ToolSet::new(), |tools, description| {
            tools
                .add_custom(&description.canonical_name)
                .expect("registered KQode tool names must be valid SDK custom tool names")
        })
        .into_vec()
}

async fn unavailable_tool(
    invocation: ToolInvocation,
    _arguments: Value,
) -> Result<ToolResult, Error> {
    Ok(unavailable_result(&invocation.tool_name))
}

fn unavailable_result(tool_name: &str) -> ToolResult {
    let message = format!(
        "KQode tool `{tool_name}` is registered, but its execution handler is not implemented"
    );
    ToolResult::Expanded(ToolResultExpanded::new(&message, "failure").with_error(message))
}

#[cfg(any(test, feature = "test-support"))]
pub(super) fn declarations_with_observer(
    descriptions: &[ToolDefinition],
    observer: tokio::sync::mpsc::UnboundedSender<ToolInvocation>,
) -> Vec<Tool> {
    declarations(descriptions)
        .into_iter()
        .map(|tool| {
            let observer = observer.clone();
            let observer_tool = define_tool(
                tool.name.clone(),
                tool.description.clone(),
                move |mut invocation: ToolInvocation, arguments: Value| {
                    let observer = observer.clone();
                    async move {
                        let tool_name = invocation.tool_name.clone();
                        invocation.arguments = arguments;
                        observer
                            .send(invocation)
                            .expect("live test tool observer should remain available");
                        Ok(unavailable_result(&tool_name))
                    }
                },
            );
            let observer_handler = observer_tool
                .handler()
                .expect("observer tool should carry a handler")
                .clone();
            tool.with_handler(observer_handler)
                .with_skip_permission(true)
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use github_copilot_sdk::types::{SessionId, ToolInvocation, ToolResult};
    use serde_json::json;

    use super::{available_tool_names, declarations};
    use crate::tools::ToolRegistry;

    #[test]
    fn registers_kqode_tools_with_parameters_and_exact_allowlist() {
        let registry = ToolRegistry::builtins();
        let descriptions = registry.definitions();
        let tools = declarations(&descriptions);

        assert_eq!(
            tools
                .iter()
                .map(|tool| tool.name.as_str())
                .collect::<Vec<_>>(),
            ["run_command", "fetch_web_url", "ask_user"]
        );
        assert_eq!(tools[0].parameters["required"], json!(["command"]));
        assert_eq!(tools[1].parameters["required"], json!(["url"]));
        assert_eq!(tools[2].parameters["required"], json!(["questions"]));
        assert!(tools.iter().all(|tool| tool.handler().is_some()));
        assert!(tools.iter().all(|tool| tool.overrides_built_in_tool));
        assert!(tools.iter().all(|tool| !tool.skip_permission));
        assert_eq!(
            available_tool_names(&descriptions),
            [
                "custom:run_command",
                "custom:fetch_web_url",
                "custom:ask_user"
            ]
        );
    }

    #[tokio::test]
    async fn registered_tools_fail_explicitly_until_handlers_are_implemented() {
        let registry = ToolRegistry::builtins();
        let tool = declarations(&registry.definitions()).remove(0);
        let mut invocation = ToolInvocation::default();
        invocation.session_id = SessionId::from("session-1");
        invocation.tool_call_id = "call-1".to_owned();
        invocation.tool_name = tool.name.clone();
        invocation.arguments = json!({"command": "echo hello"});
        let result = tool
            .handler()
            .expect("registered tool handler")
            .call(invocation)
            .await
            .expect("unavailable handler should return a tool failure");

        let ToolResult::Expanded(result) = result else {
            panic!("expected expanded failure result");
        };
        assert_eq!(result.result_type, "failure");
        assert_eq!(
            result.error.as_deref(),
            Some(
                "KQode tool `run_command` is registered, but its execution handler is not implemented"
            )
        );
    }
}
