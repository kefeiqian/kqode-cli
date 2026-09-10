use std::{ffi::OsStr, time::Duration};

use super::{super::*, support::*};
use crate::runtime::WorkspacePolicy;

#[test]
fn snapshot_is_canonical_immutable_and_debug_redacted() {
    let workspace = WorkspacePolicy::new(std::env::current_dir().unwrap()).unwrap();
    let mut source = request();
    let permissions = SandboxPermissions {
        extra_roots: vec![workspace.root().join("."), workspace.root().to_owned()],
        ..Default::default()
    };
    let context =
        CommandContext::prepare(&workspace, "private-script", source.clone(), permissions).unwrap();
    source
        .environment
        .insert("KQODE_TEST_VALUE".into(), "later-value".into());
    assert_eq!(context.cwd(), workspace.root());
    assert_eq!(
        context.permissions().extra_roots,
        vec![workspace.root().to_owned()]
    );
    assert_eq!(
        context
            .environment()
            .get(OsStr::new("KQODE_TEST_VALUE"))
            .unwrap(),
        "private-value"
    );
    for formatted in [
        format!("{context:?}"),
        format!(
            "{:?}",
            ApprovalRequest::new(std::sync::Arc::new(context.clone()))
        ),
        format!("{:?}", AuthorizedCommand::new(std::sync::Arc::new(context))),
    ] {
        for private in ["private-script", "private-value", "actual-argument"] {
            assert!(!formatted.contains(private));
        }
    }
}

#[test]
fn invalid_inputs_are_rejected_before_policy() {
    let workspace = WorkspacePolicy::new(std::env::current_dir().unwrap()).unwrap();
    let prepare = |request, script| {
        CommandContext::prepare(&workspace, script, request, SandboxPermissions::default())
    };
    assert!(prepare(request(), " ").is_err());
    let mut invalid = request();
    invalid.program = "relative.exe".into();
    assert!(prepare(invalid, "script").is_err());
    let mut invalid = request();
    invalid.cwd = Some(workspace.root().parent().unwrap().to_owned());
    assert!(prepare(invalid, "script").is_err());
    for timeout in [Duration::ZERO, Duration::MAX] {
        let mut invalid = request();
        invalid.timeout = timeout;
        assert!(prepare(invalid, "script").is_err());
    }
    let mut invalid = request();
    invalid.max_output_bytes = 0;
    assert!(prepare(invalid, "script").is_err());
    let mut invalid = request();
    invalid.arguments.push("bad\0arg".into());
    assert!(prepare(invalid, "script").is_err());
    for (name, value) in [
        ("", "value"),
        ("BAD=NAME", "value"),
        ("NAME\0", "value"),
        ("NAME", "bad\0"),
        ("API_KEY", "sensitive"),
    ] {
        let mut invalid = request();
        invalid.environment.insert(name.into(), value.into());
        let error = prepare(invalid, "script").unwrap_err();
        assert!(matches!(error, CommandGateError::InvalidEnvironment));
        assert!(!format!("{error:?} {error}").contains("sensitive"));
    }
}

#[cfg(windows)]
#[test]
fn duplicate_case_insensitive_environment_overrides_are_rejected() {
    let workspace = WorkspacePolicy::new(std::env::current_dir().unwrap()).unwrap();
    let mut invalid = request();
    invalid.environment.insert("Path".into(), "one".into());
    invalid.environment.insert("PATH".into(), "two".into());
    assert!(matches!(
        CommandContext::prepare(&workspace, "script", invalid, SandboxPermissions::default()),
        Err(CommandGateError::InvalidEnvironment)
    ));
}

#[cfg(windows)]
#[test]
fn public_constructor_binds_original_script_to_real_powershell_transport() {
    let workspace = WorkspacePolicy::new(std::env::current_dir().unwrap()).unwrap();
    let shell = crate::runtime::PowerShell::resolve(None).unwrap();
    let script = "Write-Output 'original'";
    let source = shell.prepare(script, TEST_TIMEOUT, 1024).unwrap();
    let context = CommandContext::powershell(
        &workspace,
        &shell,
        script,
        PowerShellCommandOptions {
            cwd: None,
            environment: Default::default(),
            permissions: Default::default(),
            timeout: TEST_TIMEOUT,
            max_output_bytes: 1024,
        },
    )
    .unwrap();
    assert_eq!(context.original_script(), script);
    assert_eq!(context.program(), source.program);
    assert_eq!(context.arguments(), source.arguments);
}
