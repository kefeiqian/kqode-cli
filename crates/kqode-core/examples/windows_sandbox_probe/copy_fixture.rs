use super::fixture::Fixture;
use kqode_core::{
    cancellation::CancellationToken,
    runtime::{SnapshotError, SnapshotLimits, WorkspacePolicy, WorkspaceSnapshot},
};
use std::{error::Error, time::Duration};

/// Confirms hardlink refusal, then prepares only generated regular-file fixture data.
pub(super) fn capture(fixture: &Fixture) -> Result<WorkspaceSnapshot, Box<dyn Error>> {
    fixture.reset()?;
    let source = WorkspacePolicy::new(fixture.root())?;
    let capture = || {
        WorkspaceSnapshot::capture(
            &source,
            &std::env::temp_dir(),
            SnapshotLimits {
                max_entries: 100,
                max_bytes: 1024 * 1024,
                max_depth: 10,
                timeout: Duration::from_secs(5),
            },
            &CancellationToken::default(),
        )
    };
    match capture() {
        Err(SnapshotError::UnsupportedEntry {
            reason: "hard-linked artifacts are not supported",
            ..
        }) => {}
        Err(error) => return Err(error.into()),
        Ok(snapshot) => {
            snapshot.close()?;
            return Err("source hardlink unexpectedly accepted for copying".into());
        }
    }
    fixture.replace_fixture_alias()?;
    Ok(capture()?)
}
