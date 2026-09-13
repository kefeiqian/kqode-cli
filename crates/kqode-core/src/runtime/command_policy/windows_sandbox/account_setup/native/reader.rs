use super::super::{
    SandboxAccountRole as Role, SandboxAccountSetupError as Error,
    WindowsSandboxAccountPlan as Plan, model::PrincipalFacts, reconciliation::ReadHost,
};
use super::{accounts, members, prerequisites};

pub(in super::super) struct NativeReader;

impl ReadHost for NativeReader {
    fn require_local_machine(&mut self) -> Result<(), Error> {
        prerequisites::check_local_machine()
    }
    fn inspect(&mut self, plan: &Plan, role: Role) -> Result<Option<PrincipalFacts>, Error> {
        accounts::inspect(plan, role)
    }
    fn members(&mut self, plan: &Plan) -> Result<Vec<String>, Error> {
        members::read(plan)
    }
}
