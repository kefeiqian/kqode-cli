use super::super::{
    SandboxAccountSetupError as Error, WindowsSandboxAccountPlan, guard::Guard, private_object,
};
use super::{anchor::Anchor, checked, known_folder, marker};
use crate::{
    cancellation::CancellationToken,
    runtime::{windows_file::open_child, windows_security::PrivateDescriptor},
};
use std::{ffi::OsStr, fs::File, path::Path, time::Duration};
use windows_sys::Win32::Storage::FileSystem::{FILE_SHARE_READ, FILE_SHARE_WRITE};

pub(super) const DIRECTORY: &str = "KQodeSandbox";

/// Fixed current-process-user storage with pinned ancestors, private root and immutable marker.
///
/// Uses the registered LocalAppData folder; no caller-selected path or environment fallback.
/// This is not cross-user administrator-helper authorization or an execution capability.
/// Dropping the store never removes or repairs data.
pub struct WindowsSandboxAccountStore {
    pub(super) anchor: Anchor,
    pub(super) root: File,
    marker: File,
    pub(super) plan: WindowsSandboxAccountPlan,
}

impl WindowsSandboxAccountStore {
    /// Creates a fresh private store and installation marker; never initializes an existing directory.
    ///
    /// # Errors
    ///
    /// Refuses unsafe/redirected ancestors, collisions, invalid permissions and incomplete storage.
    /// Failures may leave private partial state for explicit recovery. No SAM changes are made.
    pub fn initialize(timeout: Duration, cancellation: &CancellationToken) -> Result<Self, Error> {
        Self::resolve(true, timeout, cancellation)
    }

    /// Opens existing validated storage read-only without creating missing state.
    ///
    /// # Errors
    ///
    /// Rejects missing, corrupt, non-private or differently owned storage and unavailable limits.
    pub fn open(timeout: Duration, cancellation: &CancellationToken) -> Result<Self, Error> {
        Self::resolve(false, timeout, cancellation)
    }

    fn resolve(
        create: bool,
        timeout: Duration,
        cancellation: &CancellationToken,
    ) -> Result<Self, Error> {
        let guard = Guard::new(timeout, cancellation)?;
        guard.check()?;
        let path = known_folder::local_app_data()?;
        Self::at(&path, create, &guard)
    }

    pub(super) fn at(path: &Path, create: bool, guard: &Guard<'_>) -> Result<Self, Error> {
        let anchor = Anchor::open(path, guard)?;
        guard.check()?;
        let descriptor = checked("build private descriptor", PrivateDescriptor::new())?;
        guard.check()?;
        let root = checked(
            "open private store",
            open_child(
                anchor.parent(),
                OsStr::new(DIRECTORY),
                if create { Some(true) } else { None },
                FILE_SHARE_READ | FILE_SHARE_WRITE,
                if create { Some(&descriptor) } else { None },
                true,
            ),
        )?;
        checked(
            "validate private store",
            private_object::verify(&root, true),
        )?;
        let fresh = if create {
            guard.check()?;
            let marker = marker::Marker::fresh(&anchor.user);
            checked("write installation marker", marker::create(&root, &marker))?;
            Some(marker)
        } else {
            None
        };
        guard.check()?;
        let (marker, loaded, plan) = checked(
            "load installation marker",
            marker::load(&root, &anchor.user),
        )?;
        if fresh.is_some_and(|fresh| fresh != loaded) {
            return Err(Error::InvalidNativeData(
                "storage marker changed during creation",
            ));
        }
        let store = Self {
            anchor,
            root,
            marker,
            plan,
        };
        store.verify(guard)?;
        Ok(store)
    }

    /// The installation ID comes only from the validated private marker.
    pub fn plan(&self) -> &WindowsSandboxAccountPlan {
        &self.plan
    }

    pub(super) fn verify(&self, guard: &Guard<'_>) -> Result<(), Error> {
        self.anchor.verify(guard)?;
        checked(
            "validate private store",
            private_object::verify(&self.root, true),
        )?;
        checked(
            "validate pinned marker",
            private_object::verify(&self.marker, false),
        )?;
        guard.check()
    }
}
