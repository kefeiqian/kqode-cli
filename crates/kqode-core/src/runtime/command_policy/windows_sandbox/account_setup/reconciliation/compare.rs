use super::super::{
    SandboxAccountJournalInspection as Journal, SandboxAccountJournalState,
    SandboxAccountRole as Role, SandboxAccountSetupError as Error,
    WindowsSandboxAccountPlan as Plan,
    model::{PrincipalFacts, ROLES},
};
use super::{SandboxAccountDiscrepancy as Issue, SandboxAccountReconciliation};

/// A name or marker alone is never ownership evidence.
pub(super) fn owned_group(plan: &Plan, journal: &Journal, facts: &Option<PrincipalFacts>) -> bool {
    let Some(facts) = facts else {
        return false;
    };
    journal.identities().iter().any(|identity| {
        identity.role() == Role::Group
            && *identity == facts.identity
            && facts.marker == plan.marker()
    })
}

pub(super) fn report(
    plan: &Plan,
    journal: Journal,
    facts: [Option<PrincipalFacts>; ROLES.len()],
    members: Option<Vec<String>>,
) -> Result<SandboxAccountReconciliation, Error> {
    let mut discrepancies = Vec::new();
    if journal.state() != SandboxAccountJournalState::PreparedDisabledRecorded {
        discrepancies.push(Issue::JournalIncomplete);
    }
    for (role, observed) in ROLES.into_iter().zip(&facts) {
        let recorded = journal
            .identities()
            .iter()
            .find(|identity| identity.role() == role);
        match (recorded, observed) {
            (Some(_), None) => discrepancies.push(Issue::MissingRecordedPrincipal { role }),
            (None, Some(_)) => discrepancies.push(Issue::UnrecordedPrincipal { role }),
            (Some(recorded), Some(observed))
                if *recorded != observed.identity || observed.marker != plan.marker() =>
            {
                discrepancies.push(Issue::IdentityMismatch { role })
            }
            _ => {}
        }
        if role != Role::Group
            && observed
                .as_ref()
                .is_some_and(|facts| !facts.disabled_normal_user)
        {
            discrepancies.push(Issue::UnsafeUserState { role });
        }
    }
    if let Some(members) = &members {
        let mut recorded_members = Vec::new();
        for role in journal.membership_receipts() {
            let identity = journal
                .identities()
                .iter()
                .find(|identity| identity.role() == *role)
                .ok_or(Error::InvalidNativeData(
                    "membership receipt without identity",
                ))?;
            if !members.contains(&identity.sid().to_owned()) {
                discrepancies.push(Issue::MissingRecordedMembership { role: *role });
            }
            recorded_members.push(identity.sid());
        }
        for sid in members {
            if !recorded_members.contains(&sid.as_str()) {
                discrepancies.push(Issue::UnrecordedMembership { sid: sid.clone() });
            }
        }
    }
    Ok(SandboxAccountReconciliation {
        journal,
        group_members: members,
        discrepancies,
        observed_identities: facts
            .into_iter()
            .flatten()
            .map(|facts| facts.identity)
            .collect(),
    })
}
