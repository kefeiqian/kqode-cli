use super::super::super::{
    PrivateSandboxAccountJournal, SandboxAccountJournal,
    file_journal::tests::support::{Fixture, checkpoints, credentials},
    guard::Guard,
    model::{PrincipalFacts, ROLES},
    tests::support::FakeHost,
};
pub(super) use super::super::super::{
    SandboxAccountDiscrepancy as Issue, SandboxAccountJournalInspection as Journal,
    SandboxAccountRole as Role, SandboxAccountSetupError as Error,
    WindowsSandboxAccountPlan as Plan,
};
use super::super::{ReadHost, SandboxAccountReconciliation, engine};
use crate::cancellation::CancellationToken;
use std::time::Duration;

pub struct Reader {
    pub facts: Vec<Option<PrincipalFacts>>,
    pub members: Vec<String>,
    pub second_members: Option<Vec<String>>,
    pub calls: Vec<String>,
    pub fail: Option<String>,
    pub read_count: usize,
    pub drift_at: Option<usize>,
    pub cancel_at: Option<(usize, CancellationToken)>,
    pub delay: Duration,
    pub local_error: bool,
}

impl Reader {
    pub fn new(plan: &Plan) -> Self {
        let facts: Vec<_> = ROLES.map(|role| Some(FakeHost::facts(plan, role))).into();
        let members = facts[1..]
            .iter()
            .map(|facts| facts.as_ref().unwrap().identity.sid().to_owned())
            .collect();
        Self {
            facts,
            members,
            second_members: None,
            calls: Vec::new(),
            fail: None,
            read_count: 0,
            drift_at: None,
            cancel_at: None,
            delay: Duration::ZERO,
            local_error: false,
        }
    }

    fn step(&mut self, name: String) -> Result<(), Error> {
        self.calls.push(name.clone());
        if self.fail.as_ref() == Some(&name) {
            return Err(Error::Native {
                operation: "fake read-only query",
                code: 5,
            });
        }
        Ok(())
    }
}

impl ReadHost for Reader {
    fn require_local_machine(&mut self) -> Result<(), Error> {
        self.step("local".into())?;
        std::thread::sleep(self.delay);
        if self.local_error {
            return Err(Error::DomainControllerUnsupported);
        }
        Ok(())
    }
    fn inspect(&mut self, _plan: &Plan, role: Role) -> Result<Option<PrincipalFacts>, Error> {
        self.read_count += 1;
        self.step(format!("read:{}", self.read_count))?;
        let mut facts = self.facts[role as usize].clone();
        if self.drift_at == Some(self.read_count)
            && let Some(facts) = &mut facts
        {
            facts.identity.sid.push('9');
        }
        if let Some((count, cancellation)) = &self.cancel_at
            && *count == self.read_count
        {
            cancellation.cancel();
        }
        Ok(facts)
    }
    fn members(&mut self, _plan: &Plan) -> Result<Vec<String>, Error> {
        let count = self
            .calls
            .iter()
            .filter(|name| name.starts_with("members:"))
            .count()
            + 1;
        self.step(format!("members:{count}"))?;
        Ok(if count == 2 {
            self.second_members
                .clone()
                .unwrap_or_else(|| self.members.clone())
        } else {
            self.members.clone()
        })
    }
}

pub fn fixture(prefix: usize) -> (Fixture, Plan, Journal, Reader) {
    let fixture = Fixture::new();
    let (plan, passwords) = credentials();
    let mut writer = PrivateSandboxAccountJournal::new(fixture.parent()).unwrap();
    writer.begin(&plan, &passwords).unwrap();
    for checkpoint in checkpoints(&plan).into_iter().take(prefix - 1) {
        writer.record(&checkpoint).unwrap();
    }
    drop(writer);
    let journal = PrivateSandboxAccountJournal::inspect(&fixture.parent(), &plan).unwrap();
    let reader = Reader::new(&plan);
    (fixture, plan, journal, reader)
}

pub fn run(
    plan: &Plan,
    journal: Journal,
    reader: &mut Reader,
) -> Result<SandboxAccountReconciliation, Error> {
    let cancellation = CancellationToken::default();
    let guard = Guard::new(Duration::from_secs(15), &cancellation).unwrap();
    engine::run(plan, journal, reader, &guard)
}
