use crate::{
    cancellation::CancellationToken,
    runtime::{
        PowerShell, PowerShellCommandOptions, SandboxPermissions, SandboxProfile, SnapshotCommand,
        SnapshotLimits, WorkspacePolicy, WorkspaceSnapshot,
    },
};
use std::{collections::BTreeMap, fs, path::PathBuf, time::Duration};

pub const TEST_TIMEOUT: Duration = Duration::from_secs(15);
pub struct Fixture {
    pub root: PathBuf,
    pub source: PathBuf,
    pub staging: PathBuf,
}
impl Fixture {
    pub fn new() -> Self {
        let root = std::env::temp_dir().join(format!(
            "kqode-native-backend-test-{}",
            uuid::Uuid::new_v4()
        ));
        let source = root.join("source");
        let staging = root.join("staging");
        fs::create_dir(&root).unwrap();
        fs::create_dir(&source).unwrap();
        fs::create_dir(&staging).unwrap();
        fs::create_dir(source.join("scratch")).unwrap();
        fs::create_dir(source.join("nested")).unwrap();
        fs::write(source.join("input.txt"), "original").unwrap();
        fs::write(source.join("nested\\data.txt"), "nested").unwrap();
        Self {
            root,
            source,
            staging,
        }
    }
    pub fn command(
        &self,
        script: &str,
        profile: SandboxProfile,
        timeout: Duration,
        output: usize,
    ) -> SnapshotCommand {
        let source = WorkspacePolicy::new(&self.source).unwrap();
        let snapshot = WorkspaceSnapshot::capture(
            &source,
            &self.staging,
            SnapshotLimits {
                max_entries: 100,
                max_bytes: 4096,
                max_depth: 10,
                timeout: TEST_TIMEOUT,
            },
            &CancellationToken::default(),
        )
        .unwrap();
        let scratch = snapshot
            .root()
            .join("scratch")
            .to_string_lossy()
            .into_owned();
        SnapshotCommand::powershell(
            snapshot,
            &PowerShell::resolve(None).unwrap(),
            script,
            PowerShellCommandOptions {
                cwd: None,
                environment: BTreeMap::from([
                    ("TEMP".into(), scratch.clone()),
                    ("TMP".into(), scratch),
                    (
                        "KQODE_ORIGINAL_INPUT".into(),
                        self.source.join("input.txt").to_string_lossy().into_owned(),
                    ),
                    ("KQODE_DIAGNOSTIC_VALUE".into(), "frozen".into()),
                ]),
                permissions: SandboxPermissions {
                    profile,
                    ..Default::default()
                },
                timeout,
                max_output_bytes: output,
            },
        )
        .unwrap()
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        fs::remove_dir_all(&self.root).unwrap();
    }
}
