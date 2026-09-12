use sha2::{Digest, Sha256};
use std::{
    fs::File,
    io::Read,
    path::{Path, PathBuf},
};

use super::super::{SnapshotEntry, SnapshotError, budget::Budget};

const READ_BUFFER_BYTES: usize = 64 * 1024;

/// Hashes a pinned default stream without reading past the shared byte budget.
pub(super) fn read_data(
    file: &mut File,
    path: &Path,
    bytes: u64,
    budget: &mut Budget<'_>,
    changed: fn(PathBuf) -> SnapshotError,
) -> Result<SnapshotEntry, SnapshotError> {
    if bytes > budget.remaining_bytes() {
        return Err(SnapshotError::LimitExceeded("max_bytes"));
    }
    let mut remaining = bytes;
    let mut buffer = [0u8; READ_BUFFER_BYTES];
    let mut digest = Sha256::new();
    while remaining != 0 {
        budget.check()?;
        let length = remaining.min(buffer.len() as u64) as usize;
        let count = file
            .read(&mut buffer[..length])
            .map_err(|error| SnapshotError::io("read workspace data", error))?;
        if count == 0 {
            return Err(changed(path.to_owned()));
        }
        remaining -= count as u64;
        budget.bytes += count as u64;
        digest.update(&buffer[..count]);
    }
    Ok(SnapshotEntry::File {
        bytes,
        sha256: digest.finalize().into(),
    })
}
