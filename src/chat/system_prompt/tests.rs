use super::*;
use crate::provider::Role;

#[test]
fn system_message_includes_model_and_environment() {
    let message = system_message("kimi-k2.7-code");
    assert_eq!(message.role, Role::System);
    assert!(message.content.contains("kimi-k2.7-code"));
    assert!(message.content.contains("OS:"));
    assert!(message.content.contains("Working directory:"));
}
