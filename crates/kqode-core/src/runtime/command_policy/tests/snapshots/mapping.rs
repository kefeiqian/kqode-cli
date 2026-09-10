use std::{ffi::OsStr, fs, path::PathBuf};

use super::{
    super::super::*,
    support::{Fixture, options},
};

#[test]
fn maps_canonical_source_cwd_and_discloses_copy_semantics_without_rewriting_script_or_environment()
{
    let fixture = Fixture::new();
    for cwd in [
        None,
        Some(PathBuf::from("src")),
        Some(fixture.source.join("src")),
    ] {
        let snapshot = fixture.snapshot();
        let root = snapshot.root().to_owned();
        let mut options = options();
        options.cwd = cwd.clone();
        options
            .environment
            .insert("TEMP".into(), "explicit-host-temp".into());
        let script = "Write-Output 'private-script'";
        let expected = fixture
            .shell
            .prepare(script, options.timeout, options.max_output_bytes)
            .unwrap();
        let command =
            SnapshotCommand::powershell(snapshot, &fixture.shell, script, options).unwrap();
        let context = command.context();
        let binding = context.workspace_binding();
        let source_root = fs::canonicalize(&fixture.source).unwrap();
        assert_eq!(binding.mode(), WorkspaceExecutionMode::DisposableSnapshot);
        assert_eq!(binding.source_root(), source_root);
        assert_eq!(
            binding.source_cwd(),
            if cwd.is_some() {
                source_root.join("src")
            } else {
                source_root.clone()
            }
        );
        assert_eq!(context.workspace(), root);
        assert_eq!(
            context.cwd(),
            if cwd.is_some() {
                root.join("src")
            } else {
                root.clone()
            }
        );
        assert_eq!(context.original_script(), script);
        assert_eq!(context.arguments(), expected.arguments);
        assert_eq!(
            context.environment().get(OsStr::new("TEMP")).unwrap(),
            "explicit-host-temp"
        );
        assert_eq!(
            binding.capture_summary().unwrap().excluded_git_paths,
            vec![PathBuf::from(".git")]
        );
        for secret in ["private-script", "private-value", "explicit-host-temp"] {
            assert!(!format!("{command:?}").contains(secret));
        }
        drop(command);
        assert!(!root.exists());
    }
}

#[test]
fn excluded_missing_outside_cwd_and_unsupported_authority_dispose_the_consumed_copy() {
    let fixture = Fixture::new();
    for variant in 0..5 {
        let snapshot = fixture.snapshot();
        let root = snapshot.root().to_owned();
        let mut options = options();
        match variant {
            0 => options.cwd = Some(".git".into()),
            1 => options.cwd = Some("missing".into()),
            2 => options.cwd = Some(fixture.root.clone()),
            3 => options.permissions.profile = SandboxProfile::DangerFullAccess,
            4 => options.permissions.extra_roots.push(fixture.source.clone()),
            _ => unreachable!(),
        }
        assert!(SnapshotCommand::powershell(snapshot, &fixture.shell, "script", options).is_err());
        assert!(!root.exists(), "variant {variant}");
    }
}

#[test]
fn mismatched_copy_owner_cannot_satisfy_a_context_lease() {
    let fixture = Fixture::new();
    let command = fixture.command();
    let other = fixture.snapshot();
    assert!(matches!(
        super::super::super::snapshot_command::validate_owner(command.context(), Some(&other)),
        Err(CommandGateError::SnapshotBindingMismatch)
    ));
    other.close().unwrap();
}
