use super::super::{
    PrivateSandboxAccountJournal, SandboxAccountJournalInspection, SandboxAccountRole as Role,
    SandboxAccountSetupError as Error, WindowsSandboxAccountPlan as Plan,
    guard::Guard,
    model::{PrincipalFacts, ROLES},
    native::NativeReader,
};
use super::{MAX_MEMBERS, SandboxAccountReconciliation, compare};
use crate::cancellation::CancellationToken;
use std::{fs::File, time::Duration};

/// Separate from provisioning's Host trait: no mutation operations exist on this surface.
pub(in super::super) trait ReadHost {
    fn require_local_machine(&mut self) -> Result<(), Error>;
    fn inspect(&mut self, plan: &Plan, role: Role) -> Result<Option<PrincipalFacts>, Error>;
    fn members(&mut self, plan: &Plan) -> Result<Vec<String>, Error>;
}

impl Plan {
    /// Compares a freshly inspected journal with read-only local SAM observations.
    ///
    /// No elevation or mutation is attempted. Run on a worker: timeout/cancellation
    /// are cooperative between blocking calls, not native-call preemption. Two
    /// member samples and surrounding identity reads reject observed drift; these
    /// are not atomic and do not defend against adversarial owner/admin ABA races.
    ///
    /// # Errors
    ///
    /// Refuses invalid journal storage, domain controllers, query errors, limits,
    /// cancellation and observed concurrent change; never returns partial success.
    /// Stable differences are returned as discrepancies without automatic recovery.
    pub fn reconcile_disabled_accounts(
        &self,
        parent: &File,
        timeout: Duration,
        cancellation: &CancellationToken,
    ) -> Result<SandboxAccountReconciliation, Error> {
        let guard = Guard::new(timeout, cancellation)?;
        guard.check()?;
        let journal = PrivateSandboxAccountJournal::inspect(parent, self).map_err(|source| {
            Error::Journal {
                operation: "inspect before reconciliation",
                source,
            }
        })?;
        run(self, journal, &mut NativeReader, &guard)
    }
}

pub(super) fn run(
    plan: &Plan,
    journal: SandboxAccountJournalInspection,
    host: &mut dyn ReadHost,
    guard: &Guard<'_>,
) -> Result<SandboxAccountReconciliation, Error> {
    guard.check()?;
    host.require_local_machine()?;
    let before = identities(plan, host, guard)?;
    let members = if compare::owned_group(plan, &journal, &before[Role::Group as usize]) {
        Some(membership(plan, host, guard)?)
    } else {
        None
    };
    let after = identities(plan, host, guard)?;
    if before != after {
        return Err(Error::ObservationChanged);
    }
    if let Some(first) = &members {
        let second = membership(plan, host, guard)?;
        let final_identities = identities(plan, host, guard)?;
        if first != &second || after != final_identities {
            return Err(Error::ObservationChanged);
        }
    }
    guard.check()?;
    let report = compare::report(plan, journal, after, members)?;
    guard.check()?;
    Ok(report)
}

fn identities(
    plan: &Plan,
    host: &mut dyn ReadHost,
    guard: &Guard<'_>,
) -> Result<[Option<PrincipalFacts>; ROLES.len()], Error> {
    let mut facts = std::array::from_fn(|_| None);
    for (index, role) in ROLES.into_iter().enumerate() {
        guard.check()?;
        let found = host.inspect(plan, role)?;
        guard.check()?;
        if found
            .as_ref()
            .is_some_and(|found| found.identity.role() != role || found.identity.sid().is_empty())
        {
            return Err(Error::InvalidNativeData("reconciliation identity"));
        }
        facts[index] = found;
    }
    Ok(facts)
}

fn membership(
    plan: &Plan,
    host: &mut dyn ReadHost,
    guard: &Guard<'_>,
) -> Result<Vec<String>, Error> {
    guard.check()?;
    let mut members = host.members(plan)?;
    guard.check()?;
    if members.len() > MAX_MEMBERS {
        return Err(Error::ObservationLimit);
    }
    members.sort();
    if members.iter().any(String::is_empty) || members.windows(2).any(|pair| pair[0] == pair[1]) {
        return Err(Error::InvalidNativeData("reconciliation member SIDs"));
    }
    Ok(members)
}
