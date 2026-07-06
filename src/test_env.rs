//! Shared process-environment test lock.

use std::sync::{Mutex, MutexGuard, OnceLock};

/// Serializes tests that mutate process-global environment variables.
pub(crate) fn lock() -> MutexGuard<'static, ()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(())).lock().unwrap()
}
