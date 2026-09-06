use serde_json::Value;

use crate::inference::{ChatCompletion, ChatError};

const MODEL_HEADER: &str = "`model`:";

pub(super) fn parse_chat(output: &str) -> Result<ChatCompletion, ChatError> {
    let mut final_response = None;
    let mut deltas = String::new();
    let mut model = None;
    let mut result_exit_code = None;

    for (index, line) in output.lines().enumerate() {
        if line.trim().is_empty() {
            continue;
        }
        let event: Value = serde_json::from_str(line).map_err(|error| {
            ChatError::Response(format!(
                "Copilot CLI output line {} is invalid JSON: {error}",
                index + 1
            ))
        })?;
        match event.get("type").and_then(Value::as_str) {
            Some("assistant.message") => {
                if let Some(content) = event.pointer("/data/content").and_then(Value::as_str) {
                    final_response = Some(content.to_owned());
                }
                if let Some(value) = event.pointer("/data/model").and_then(Value::as_str) {
                    model = Some(value.to_owned());
                }
            }
            Some("assistant.message_delta") => {
                if let Some(delta) = event.pointer("/data/deltaContent").and_then(Value::as_str) {
                    deltas.push_str(delta);
                }
                if let Some(value) = event.pointer("/data/model").and_then(Value::as_str) {
                    model = Some(value.to_owned());
                }
            }
            Some("result") => {
                result_exit_code = event.get("exitCode").and_then(Value::as_i64);
            }
            _ => {}
        }
    }

    if result_exit_code.is_some_and(|exit_code| exit_code != 0) {
        return Err(ChatError::Response(format!(
            "Copilot CLI reported result exit code {}",
            result_exit_code.unwrap_or_default()
        )));
    }
    let message = final_response
        .or_else(|| (!deltas.is_empty()).then_some(deltas))
        .ok_or_else(|| {
            ChatError::Response(
                "Copilot CLI output did not contain an assistant response".to_owned(),
            )
        })?;
    Ok(ChatCompletion {
        message,
        model: model.unwrap_or_default(),
    })
}

pub(super) fn parse_models(output: &str) -> Vec<String> {
    let Some(header) = output
        .lines()
        .position(|line| line.trim().starts_with(MODEL_HEADER))
    else {
        return Vec::new();
    };
    output
        .lines()
        .skip(header + 1)
        .skip_while(|line| line.trim().is_empty())
        .map(str::trim)
        .take_while(|line| line.starts_with("- \"") && line.ends_with('"'))
        .map(|line| {
            line.trim_start_matches("- \"")
                .trim_end_matches('"')
                .to_owned()
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::{parse_chat, parse_models};
    use crate::inference::ChatCompletion;

    #[test]
    fn parses_final_copilot_response_and_model() {
        let output = concat!(
            "{\"type\":\"assistant.message\",\"data\":{\"content\":\"Hello\",",
            "\"model\":\"gpt-test\"}}\n",
            "{\"type\":\"result\",\"exitCode\":0}\n"
        );

        assert_eq!(
            parse_chat(output).unwrap(),
            ChatCompletion {
                message: "Hello".to_owned(),
                model: "gpt-test".to_owned(),
            }
        );
    }

    #[test]
    fn parses_models_from_copilot_help() {
        let output = "
          `model`: AI model to use.
            - \"gpt-test\"
            - \"claude-test\"

          `theme`: color theme.
        ";

        assert_eq!(parse_models(output), ["gpt-test", "claude-test"]);
    }
}
