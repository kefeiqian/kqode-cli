use super::super::{SnapshotError, SnapshotLimits, WorkspaceSnapshot};
use crate::{cancellation::CancellationToken, runtime::WorkspacePolicy};
use std::{
    fs,
    os::windows::process::CommandExt,
    path::{Path, PathBuf},
    time::Duration,
};

pub struct Fixture {
    pub root: PathBuf,
    pub source: PathBuf,
    pub staging: PathBuf,
}
impl Fixture {
    pub fn new() -> Self {
        let root =
            std::env::temp_dir().join(format!("kqode-snapshot-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&root).unwrap();
        let source = root.join("source");
        let staging = root.join("staging");
        fs::create_dir(&source).unwrap();
        fs::create_dir(&staging).unwrap();
        Self {
            root,
            source,
            staging,
        }
    }
    pub fn capture(&self, limits: SnapshotLimits) -> Result<WorkspaceSnapshot, SnapshotError> {
        WorkspaceSnapshot::capture(
            &WorkspacePolicy::new(&self.source).unwrap(),
            &self.staging,
            limits,
            &CancellationToken::default(),
        )
    }
    pub fn assert_clean(&self) {
        assert_eq!(fs::read_dir(&self.staging).unwrap().count(), 0);
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        fs::remove_dir_all(&self.root).unwrap();
    }
}
pub fn limits() -> SnapshotLimits {
    SnapshotLimits {
        max_entries: 100,
        max_bytes: 1024 * 1024,
        max_depth: 10,
        timeout: Duration::from_secs(5),
    }
}
pub fn junction(link: &Path, target: &Path) {
    let command = PathBuf::from(std::env::var_os("SystemRoot").unwrap()).join("System32\\cmd.exe");
    let result = std::process::Command::new(command)
        .args(["/d", "/v:off", "/c"])
        .raw_arg(r#"mklink /J "%KQODE_LINK%" "%KQODE_TARGET%""#)
        .env("KQODE_LINK", link)
        .env("KQODE_TARGET", target)
        .output()
        .unwrap();
    assert!(
        result.status.success(),
        "{}",
        String::from_utf8_lossy(&result.stderr)
    );
}
