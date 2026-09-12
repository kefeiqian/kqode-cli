use super::{
    super::{
        ProtectedSandboxPasswords, SandboxAccountCheckpoint, SandboxAccountJournal,
        WindowsSandboxAccountPlan,
    },
    session::Session,
    storage::{self, Storage},
};
use std::{fs::File, io};

/// Create-new, private JSONL storage for first-time disabled-account preparation.
///
/// The trusted host must supply a securely opened, stable local parent outside
/// sandbox-writable trees. This type binds to that handle, not a later pathname.
/// New children receive protected current-process-user/SYSTEM DACLs at creation.
/// Each bounded, sequenced record is flushed to disk before acknowledgement.
///
/// Any error poisons the writer. Drop closes handles but never deletes state.
/// Existing directories are never adopted, repaired, truncated or resumed.
/// This is not a recovery reader, setup authorization, or an execution capability.
pub struct PrivateSandboxAccountJournal {
    session: Session,
    storage: Option<Storage>,
    parent: File,
}

impl PrivateSandboxAccountJournal {
    /// Takes ownership of the trusted parent handle without creating any child.
    ///
    /// # Errors
    ///
    /// Rejects reparse/non-directory handles and storage without local volume-GUID
    /// paths or persistent ACL support. Refuses thread impersonation here and at
    /// creation. Selecting and retaining trusted parent storage remains a host responsibility.
    pub fn new(parent: File) -> io::Result<Self> {
        storage::validate_parent(&parent)?;
        Ok(Self {
            session: Session::default(),
            storage: None,
            parent,
        })
    }
}

impl SandboxAccountJournal for PrivateSandboxAccountJournal {
    fn begin(
        &mut self,
        plan: &WindowsSandboxAccountPlan,
        passwords: &ProtectedSandboxPasswords,
    ) -> io::Result<()> {
        let Self {
            session,
            storage,
            parent,
        } = self;
        session.begin(plan, passwords, |record| {
            *storage = Some(Storage::create(parent, plan)?);
            storage
                .as_mut()
                .ok_or_else(super::progress::invalid)?
                .append(record)
        })
    }

    fn record(&mut self, checkpoint: &SandboxAccountCheckpoint) -> io::Result<()> {
        let Self {
            session, storage, ..
        } = self;
        session.record(checkpoint, |record| {
            storage
                .as_mut()
                .ok_or_else(super::progress::invalid)?
                .append(record)
        })
    }
}
