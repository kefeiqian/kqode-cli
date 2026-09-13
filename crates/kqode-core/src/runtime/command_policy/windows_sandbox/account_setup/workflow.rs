use super::{
    DisabledSandboxAccounts, SandboxAccountCheckpoint as Checkpoint, SandboxAccountIdentity,
    SandboxAccountJournal, SandboxAccountRole as Role, SandboxAccountSetupError as Error,
    WindowsSandboxAccountPlan,
    credentials::Passwords,
    guard::Guard,
    model::{PrincipalFacts, ROLES},
    native::NativeHost,
};
use crate::cancellation::CancellationToken;
use secrecy::SecretString;
use std::time::Duration;

/// Native mutation surface deliberately has no enable, password-reset or delete operation.
pub(super) trait Host {
    fn require_elevated(&mut self) -> Result<(), Error>;
    fn inspect(
        &mut self,
        plan: &WindowsSandboxAccountPlan,
        role: Role,
    ) -> Result<Option<PrincipalFacts>, Error>;
    fn create(
        &mut self,
        plan: &WindowsSandboxAccountPlan,
        role: Role,
        password: Option<&SecretString>,
    ) -> Result<(), Error>;
    fn add_member(
        &mut self,
        plan: &WindowsSandboxAccountPlan,
        group: &SandboxAccountIdentity,
        user: &SandboxAccountIdentity,
    ) -> Result<(), Error>;
}

impl WindowsSandboxAccountPlan {
    /// Creates only new, disabled ordinary accounts and their new local group.
    ///
    /// Requires a trusted administrator helper with explicit setup consent and a
    /// private durable journal. Does not elevate itself, execute model commands,
    /// grant filesystem/logon rights, configure networking or enable accounts.
    /// Run on a helper/worker, not an async executor/UI thread.
    ///
    /// # Errors
    ///
    /// Refuses existing names, invalid state, missing elevation, storage/native
    /// failures and cancellation/time limits between operations. Partial identities
    /// stay disabled; intents and SID receipts must be inspected before recovery.
    /// There is no implicit adoption, rollback/deletion or resume by name.
    pub fn provision_disabled(
        &self,
        journal: &mut dyn SandboxAccountJournal,
        timeout: Duration,
        cancellation: &CancellationToken,
    ) -> Result<DisabledSandboxAccounts, Error> {
        run(self, &mut NativeHost, journal, timeout, cancellation)
    }
}

pub(super) fn run(
    plan: &WindowsSandboxAccountPlan,
    host: &mut dyn Host,
    journal: &mut dyn SandboxAccountJournal,
    timeout: Duration,
    cancellation: &CancellationToken,
) -> Result<DisabledSandboxAccounts, Error> {
    let guard = Guard::new(timeout, cancellation)?;
    let check = || guard.check();
    check()?;
    host.require_elevated()?;
    for role in ROLES {
        check()?;
        if host.inspect(plan, role)?.is_some() {
            return Err(Error::NameAlreadyExists(role));
        }
    }
    let passwords = Passwords::generate()?;
    let protected = passwords.protect(plan)?;
    check()?;
    journal
        .begin(plan, &protected)
        .map_err(|source| Error::Journal {
            operation: "begin",
            source,
        })?;
    let mut identities: Vec<SandboxAccountIdentity> = Vec::new();
    for role in ROLES {
        check()?;
        record(journal, Checkpoint::Creating { role })?;
        check()?;
        host.create(plan, role, passwords.get(role))?;
        // Record the mutation even if cancellation arrived during the native call.
        let facts = host
            .inspect(plan, role)?
            .ok_or(Error::OwnershipMismatch(role))?;
        validate(plan, role, &facts)?;
        if identities
            .iter()
            .any(|known| known.sid == facts.identity.sid)
        {
            return Err(Error::OwnershipMismatch(role));
        }
        record(
            journal,
            Checkpoint::Created {
                identity: facts.identity.clone(),
            },
        )?;
        identities.push(facts.identity);
    }
    for user in &identities[1..] {
        check()?;
        record(journal, Checkpoint::AddingMember { role: user.role })?;
        check()?;
        host.add_member(plan, &identities[0], user)?;
        record(journal, Checkpoint::MemberAdded { role: user.role })?;
    }
    for identity in &identities {
        check()?;
        let facts = host
            .inspect(plan, identity.role)?
            .ok_or(Error::OwnershipMismatch(identity.role))?;
        validate(plan, identity.role, &facts)?;
        if &facts.identity != identity {
            return Err(Error::OwnershipMismatch(identity.role));
        }
    }
    check()?;
    record(
        journal,
        Checkpoint::PreparedDisabled {
            identities: identities.clone(),
        },
    )?;
    check()?;
    Ok(DisabledSandboxAccounts { identities })
}

fn record(journal: &mut dyn SandboxAccountJournal, checkpoint: Checkpoint) -> Result<(), Error> {
    journal
        .record(&checkpoint)
        .map_err(|source| Error::Journal {
            operation: "checkpoint",
            source,
        })
}

pub(super) fn validate(
    plan: &WindowsSandboxAccountPlan,
    role: Role,
    facts: &PrincipalFacts,
) -> Result<(), Error> {
    if facts.identity.role != role
        || facts.identity.name != plan.name(role)
        || facts.identity.sid.is_empty()
        || facts.marker != plan.marker()
        || (role != Role::Group && !facts.disabled_normal_user)
    {
        return Err(Error::OwnershipMismatch(role));
    }
    Ok(())
}
