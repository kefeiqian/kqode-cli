use super::super::{
    SandboxAccountIdentity, SandboxAccountRole as Role, SandboxAccountSetupError as Error,
    WindowsSandboxAccountPlan,
    model::PrincipalFacts,
    workflow::{Host, validate},
};
use super::{accounts, prerequisites};
use secrecy::SecretString;

pub(in crate::runtime::command_policy::windows_sandbox::account_setup) struct NativeHost;

impl Host for NativeHost {
    fn require_elevated(&mut self) -> Result<(), Error> {
        prerequisites::check()
    }

    fn inspect(
        &mut self,
        plan: &WindowsSandboxAccountPlan,
        role: Role,
    ) -> Result<Option<PrincipalFacts>, Error> {
        accounts::inspect(plan, role)
    }

    fn create(
        &mut self,
        plan: &WindowsSandboxAccountPlan,
        role: Role,
        password: Option<&SecretString>,
    ) -> Result<(), Error> {
        accounts::create(plan, role, password)
    }

    fn add_member(
        &mut self,
        plan: &WindowsSandboxAccountPlan,
        group: &SandboxAccountIdentity,
        user: &SandboxAccountIdentity,
    ) -> Result<(), Error> {
        for expected in [group, user] {
            let facts = accounts::inspect(plan, expected.role)?
                .ok_or(Error::OwnershipMismatch(expected.role))?;
            validate(plan, expected.role, &facts)?;
            if &facts.identity != expected {
                return Err(Error::OwnershipMismatch(expected.role));
            }
        }
        if group.role != Role::Group || user.role == Role::Group {
            return Err(Error::InvalidPlan);
        }
        accounts::add_member(group, user)
    }
}
