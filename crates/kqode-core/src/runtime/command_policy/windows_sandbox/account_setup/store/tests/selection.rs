use super::super::known_folder;
use super::support::*;
use crate::runtime::{
    CommandContext, CommandGateError, ProcessRequest, SandboxPermissions, SandboxProfile,
    SnapshotError, SnapshotLimits, WorkspacePolicy, WorkspaceSnapshot,
};
use std::{collections::BTreeMap, fs};

pub(super) fn request() -> ProcessRequest {
    ProcessRequest {
        program: std::env::current_exe().unwrap().into_os_string(),
        arguments: vec![],
        cwd: None,
        environment: BTreeMap::new(),
        timeout: Duration::from_secs(15),
        max_output_bytes: 1024,
    }
}

#[test]
fn all_profiles_reject_account_store_ancestors_as_workspace_or_extra_root() {
    let fixture = Fixture::new();
    let local = WorkspacePolicy::new(known_folder::local_app_data().unwrap()).unwrap();
    let workspace = WorkspacePolicy::new(&fixture.0).unwrap();
    for profile in [
        SandboxProfile::ReadOnly,
        SandboxProfile::WorkspaceWrite,
        SandboxProfile::DangerFullAccess,
    ] {
        for extra in [false, true] {
            let result = CommandContext::prepare(
                if extra { &workspace } else { &local },
                "fixture",
                request(),
                SandboxPermissions {
                    profile,
                    extra_roots: if extra {
                        vec![local.root().to_owned()]
                    } else {
                        vec![]
                    },
                    ..Default::default()
                },
            );
            assert!(matches!(
                result,
                Err(CommandGateError::AccountStorage(
                    Error::ProtectedStorageOverlap
                ))
            ));
        }
    }
}

#[test]
fn snapshot_rejects_protected_ancestors_before_capture_in_either_direction() {
    let fixture = Fixture::new();
    let source = fixture.0.join("source");
    let staging = fixture.0.join("staging");
    fs::create_dir(&source).unwrap();
    fs::create_dir(&staging).unwrap();
    fs::write(source.join("kept"), "unchanged").unwrap();
    let local = known_folder::local_app_data().unwrap();
    for (source, destination) in [(&local, &staging), (&source, &local)] {
        let result = WorkspaceSnapshot::capture(
            &WorkspacePolicy::new(source).unwrap(),
            destination,
            SnapshotLimits {
                max_entries: 10,
                max_bytes: 1024,
                max_depth: 4,
                timeout: Duration::from_secs(15),
            },
            &CancellationToken::default(),
        );
        assert!(matches!(
            result,
            Err(SnapshotError::AccountStorage(
                Error::ProtectedStorageOverlap
            ))
        ));
        assert_eq!(fs::read_dir(&staging).unwrap().count(), 0);
    }
    assert_eq!(
        fs::read_to_string(source.join("kept")).unwrap(),
        "unchanged"
    );
}
