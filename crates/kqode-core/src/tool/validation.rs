use serde_json::Value;

pub(super) fn validate(schema: &Value, value: &Value) -> Result<(), String> {
    validate_at(schema, value, "$")
}

fn validate_at(schema: &Value, value: &Value, path: &str) -> Result<(), String> {
    match schema.get("type").and_then(Value::as_str) {
        Some("object") => validate_object(schema, value, path),
        Some("array") => validate_array(schema, value, path),
        Some("string") => validate_string(schema, value, path),
        Some("integer") => validate_number(schema, value, true, path),
        Some("number") => validate_number(schema, value, false, path),
        Some("boolean") if value.is_boolean() => Ok(()),
        Some("boolean") => Err(format!("{path} must be a boolean")),
        Some(kind) => Err(format!("{path} uses unsupported schema type {kind}")),
        None => Ok(()),
    }
}

fn validate_object(schema: &Value, value: &Value, path: &str) -> Result<(), String> {
    let object = value
        .as_object()
        .ok_or_else(|| format!("{path} must be an object"))?;
    let properties = schema.get("properties").and_then(Value::as_object);
    if let Some(required) = schema.get("required").and_then(Value::as_array) {
        for name in required.iter().filter_map(Value::as_str) {
            if !object.contains_key(name) {
                return Err(format!("{path}.{name} is required"));
            }
        }
    }
    if schema.get("additionalProperties") == Some(&Value::Bool(false)) {
        for name in object.keys() {
            if !properties.is_some_and(|properties| properties.contains_key(name)) {
                return Err(format!("{path}.{name} is not allowed"));
            }
        }
    }
    if let Some(properties) = properties {
        for (name, property_schema) in properties {
            if let Some(property) = object.get(name) {
                validate_at(property_schema, property, &format!("{path}.{name}"))?;
            }
        }
    }
    Ok(())
}

fn validate_array(schema: &Value, value: &Value, path: &str) -> Result<(), String> {
    let array = value
        .as_array()
        .ok_or_else(|| format!("{path} must be an array"))?;
    if let Some(minimum) = schema.get("minItems").and_then(Value::as_u64)
        && array.len() < minimum as usize
    {
        return Err(format!("{path} must contain at least {minimum} item(s)"));
    }
    if let Some(item_schema) = schema.get("items") {
        for (index, item) in array.iter().enumerate() {
            validate_at(item_schema, item, &format!("{path}[{index}]"))?;
        }
    }
    Ok(())
}

fn validate_string(schema: &Value, value: &Value, path: &str) -> Result<(), String> {
    let text = value
        .as_str()
        .ok_or_else(|| format!("{path} must be a string"))?;
    if let Some(minimum) = schema.get("minLength").and_then(Value::as_u64)
        && text.chars().count() < minimum as usize
    {
        return Err(format!(
            "{path} must contain at least {minimum} character(s)"
        ));
    }
    Ok(())
}

fn validate_number(schema: &Value, value: &Value, integer: bool, path: &str) -> Result<(), String> {
    let number = if integer {
        value
            .as_i64()
            .map(|value| value as f64)
            .ok_or_else(|| format!("{path} must be an integer"))?
    } else {
        value
            .as_f64()
            .ok_or_else(|| format!("{path} must be a number"))?
    };
    if let Some(minimum) = schema.get("minimum").and_then(Value::as_f64)
        && number < minimum
    {
        return Err(format!("{path} must be at least {minimum}"));
    }
    if let Some(maximum) = schema.get("maximum").and_then(Value::as_f64)
        && number > maximum
    {
        return Err(format!("{path} must be at most {maximum}"));
    }
    Ok(())
}
