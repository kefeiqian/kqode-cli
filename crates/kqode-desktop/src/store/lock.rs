//! Advisory process lock for serializing bootstrap against one DB path.

use std::fs::{File, OpenOptions};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use fs2::FileExt;

use super::StoreError;

const BOOTSTRAP_LOCK_TIMEOUT_MS: u64 = 4_000;
const BOOTSTRAP_LOCK_POLL_MS: u64 = 20;

/// Held advisory bootstrap lock for a single database path.
#[derive(Debug)]
pub(super) struct BootstrapLock {
    file: File,
}

/// Takes the sidecar bootstrap lock, polling until the startup-safe timeout.
///
/// # Errors
/// Returns [`StoreError::BootstrapLock`] when the sidecar lock file cannot be
/// opened or locked for a non-contention reason. Returns
/// [`StoreError::BootstrapLockTimeout`] when another process holds the lock
/// beyond the bounded wait.
pub(super) fn acquire(db_path: &Path) -> Result<BootstrapLock, StoreError> {
    acquire_with_timeout(
        db_path,
        Duration::from_millis(BOOTSTRAP_LOCK_TIMEOUT_MS),
        Duration::from_millis(BOOTSTRAP_LOCK_POLL_MS),
    )
}

fn acquire_with_timeout(
    db_path: &Path,
    timeout: Duration,
    poll: Duration,
) -> Result<BootstrapLock, StoreError> {
    let lock_path = lock_path(db_path);
    let file = OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .open(&lock_path)
        .map_err(StoreError::BootstrapLock)?;
    let start = Instant::now();

    loop {
        match file.try_lock_exclusive() {
            Ok(()) => {
                pause_after_test_lock();
                return Ok(BootstrapLock { file });
            }
            Err(err) if is_lock_busy(&err) && start.elapsed() < timeout => {
                std::thread::sleep(poll);
            }
            Err(err) if is_lock_busy(&err) => {
                return Err(StoreError::BootstrapLockTimeout {
                    timeout_ms: duration_ms(timeout),
                });
            }
            Err(err) => return Err(StoreError::BootstrapLock(err)),
        }
    }
}

impl Drop for BootstrapLock {
    fn drop(&mut self) {
        let _ = self.file.unlock();
    }
}

fn lock_path(db_path: &Path) -> PathBuf {
    let mut path = db_path.as_os_str().to_owned();
    path.push(".lock");
    PathBuf::from(path)
}

#[cfg(test)]
/// Takes the sidecar bootstrap lock with test-controlled timeout and polling.
pub(super) fn acquire_for_test(
    db_path: &Path,
    timeout: Duration,
    poll: Duration,
) -> Result<BootstrapLock, StoreError> {
    acquire_with_timeout(db_path, timeout, poll)
}

fn duration_ms(duration: Duration) -> u64 {
    u64::try_from(duration.as_millis()).unwrap_or(u64::MAX)
}

fn is_lock_busy(err: &std::io::Error) -> bool {
    if matches!(
        err.kind(),
        std::io::ErrorKind::WouldBlock | std::io::ErrorKind::Interrupted
    ) {
        return true;
    }
    err.raw_os_error() == fs2::lock_contended_error().raw_os_error()
}

#[cfg(test)]
fn pause_after_test_lock() {
    let Some(ms) = std::env::var_os("KQODE_STORE_BOOTSTRAP_HOLD_LOCK_MS") else {
        return;
    };
    let Ok(ms) = ms.to_string_lossy().parse::<u64>() else {
        return;
    };
    std::thread::sleep(Duration::from_millis(ms));
}

#[cfg(not(test))]
fn pause_after_test_lock() {}
