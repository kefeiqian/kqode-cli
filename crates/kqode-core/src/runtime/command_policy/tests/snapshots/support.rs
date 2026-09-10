use std::{collections::BTreeMap, fs, path::PathBuf};

use super::super::{super::*, support::TEST_TIMEOUT};
use crate::{
    cancellation::CancellationToken,
    runtime::{PowerShell, SnapshotLimits, WorkspacePolicy, WorkspaceSnapshot},
};

pub struct Fixture {
    pub root: PathBuf,
    pub source: PathBuf,
    pub staging: PathBuf,
    pub shell: PowerShell,
}

impl Fixture {
    pub fn new() -> Self {
        let root =
            std::env::temp_dir().join(format!("kqode-snapshot-approval-{}", uuid::Uuid::new_v4()));
        let source = root.join("source");
        let staging = root.join("staging");
        fs::create_dir(&root).unwrap();
        fs::create_dir(&source).unwrap();
        fs::create_dir(&staging).unwrap();
        fs::create_dir(source.join("src")).unwrap();
        fs::write(source.join("src\\file.txt"), "original").unwrap();
        fs::create_dir(source.join(".git")).unwrap();
        fs::write(source.join(".git\\config"), "metadata").unwrap();
        Self {
            root,
            source,
            staging,
            shell: PowerShell::resolve(None).unwrap(),
        }
    }

    pub fn snapshot(&self) -> WorkspaceSnapshot {
        WorkspaceSnapshot::capture(
            &WorkspacePolicy::new(&self.source).unwrap(),
            &self.staging,
            SnapshotLimits {
                max_entries: 16,
                max_bytes: 4096,
                max_depth: 4,
                timeout: TEST_TIMEOUT,
            },
            &CancellationToken::default(),
        )
        .unwrap()
    }

    pub fn command(&self) -> SnapshotCommand {
        SnapshotCommand::powershell(
            self.snapshot(),
            &self.shell,
            "Write-Output 'private-script'",
            options(),
        )
        .unwrap()
    }
}

impl Drop for Fixture {
    fn drop(&mut self) {
        fs::remove_dir_all(&self.root).unwrap();
    }
}

pub fn options() -> PowerShellCommandOptions {
    PowerShellCommandOptions {
        cwd: Some("src".into()),
        environment: BTreeMap::from([("KQODE_TEST_VALUE".into(), "private-value".into())]),
        permissions: SandboxPermissions {
            profile: SandboxProfile::WorkspaceWrite,
            ..Default::default()
        },
        timeout: TEST_TIMEOUT,
        max_output_bytes: 1024,
    }
}
