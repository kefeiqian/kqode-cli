use super::super::{
    DisabledSandboxAccounts, ProtectedSandboxPasswords, SandboxAccountCheckpoint as Checkpoint,
    SandboxAccountIdentity as Identity, SandboxAccountJournal, SandboxAccountRole as Role,
    SandboxAccountSetupError as Error, WindowsSandboxAccountPlan as Plan,
    model::PrincipalFacts,
    workflow::{self, Host},
};
use crate::cancellation::CancellationToken;
use secrecy::{ExposeSecret, SecretString};
use std::{cell::RefCell, io, rc::Rc, time::Duration};

#[derive(Default)]
pub struct FakeHost {
    pub entries: Vec<PrincipalFacts>,
    pub members: Vec<Role>,
    pub events: Rc<RefCell<Vec<String>>>,
    pub fail: Option<String>,
    pub malformed: Option<Role>,
    pub invalid_user_state: bool,
    pub duplicate_sid: bool,
    pub prerequisite_error: Option<Error>,
    pub final_sid_mismatch: bool,
    pub cancel_after_create: Option<(Role, CancellationToken)>,
    pub delay: Duration,
}

impl FakeHost {
    pub fn facts(plan: &Plan, role: Role) -> PrincipalFacts {
        PrincipalFacts {
            identity: Identity {
                role,
                name: plan.name(role).into(),
                sid: format!("S-1-5-21-1-2-3-{}", 1000 + u32::from(role as u8)),
            },
            marker: plan.marker().into(),
            disabled_normal_user: role != Role::Group,
        }
    }
    fn step(&self, event: String) -> Result<(), Error> {
        self.events.borrow_mut().push(event.clone());
        if self.fail.as_ref() == Some(&event) {
            Err(Error::Native {
                operation: "fake account API",
                code: 5,
            })
        } else {
            Ok(())
        }
    }
}

impl Host for FakeHost {
    fn require_elevated(&mut self) -> Result<(), Error> {
        self.step("elevation".into())?;
        if let Some(error) = self.prerequisite_error.take() {
            return Err(error);
        }
        std::thread::sleep(self.delay);
        Ok(())
    }
    fn inspect(&mut self, _plan: &Plan, role: Role) -> Result<Option<PrincipalFacts>, Error> {
        self.step(format!("inspect:{role:?}"))?;
        let mut facts = self
            .entries
            .iter()
            .find(|entry| entry.identity.role == role)
            .cloned();
        if self.final_sid_mismatch && self.members.len() == 2 && role == Role::Offline {
            facts.as_mut().unwrap().identity.sid.push('9');
        }
        Ok(facts)
    }
    fn create(
        &mut self,
        plan: &Plan,
        role: Role,
        password: Option<&SecretString>,
    ) -> Result<(), Error> {
        self.step(format!("create:{role:?}"))?;
        assert_eq!(password.is_none(), role == Role::Group);
        if let Some(password) = password {
            assert!(password.expose_secret().len() == 68);
        }
        let mut facts = Self::facts(plan, role);
        if self.invalid_user_state && role != Role::Group {
            facts.disabled_normal_user = false;
        }
        if self.duplicate_sid && role != Role::Group {
            facts.identity.sid = Self::facts(plan, Role::Group).identity.sid;
        }
        if self.malformed == Some(role) {
            facts.marker = "not this installation".into();
        }
        self.entries.push(facts);
        if let Some((target, token)) = &self.cancel_after_create
            && *target == role
        {
            token.cancel();
        }
        Ok(())
    }
    fn add_member(&mut self, _plan: &Plan, group: &Identity, user: &Identity) -> Result<(), Error> {
        assert_eq!(group.role, Role::Group);
        self.step(format!("add:{:?}", user.role))?;
        self.members.push(user.role);
        Ok(())
    }
}

#[derive(Default)]
pub struct MemoryJournal {
    pub events: Rc<RefCell<Vec<String>>>,
    pub records: Vec<String>,
    pub fail: Option<String>,
}

impl MemoryJournal {
    fn write(&mut self, event: String) -> io::Result<()> {
        self.events.borrow_mut().push(event.clone());
        if self.fail.as_ref() == Some(&event) {
            return Err(io::Error::other("simulated storage failure"));
        }
        self.records.push(event);
        Ok(())
    }
}

impl SandboxAccountJournal for MemoryJournal {
    fn begin(&mut self, _plan: &Plan, secrets: &ProtectedSandboxPasswords) -> io::Result<()> {
        assert_eq!(
            format!("{secrets:?}"),
            "ProtectedSandboxPasswords([REDACTED])"
        );
        self.write("journal:begin".into())
    }
    fn record(&mut self, checkpoint: &Checkpoint) -> io::Result<()> {
        self.write(match checkpoint {
            Checkpoint::Creating { role } => format!("intent:{role:?}"),
            Checkpoint::Created { identity } => format!("created:{:?}", identity.role),
            Checkpoint::AddingMember { role } => format!("member-intent:{role:?}"),
            Checkpoint::MemberAdded { role } => format!("member-added:{role:?}"),
            Checkpoint::PreparedDisabled { .. } => "prepared-disabled".into(),
        })
    }
}

pub fn fixture() -> (Plan, FakeHost, MemoryJournal) {
    let plan = Plan::new(uuid::Uuid::new_v4()).unwrap();
    let host = FakeHost::default();
    let journal = MemoryJournal {
        events: host.events.clone(),
        ..Default::default()
    };
    (plan, host, journal)
}

pub fn run(
    plan: &Plan,
    host: &mut FakeHost,
    journal: &mut MemoryJournal,
) -> Result<DisabledSandboxAccounts, Error> {
    workflow::run(
        plan,
        host,
        journal,
        Duration::from_secs(15),
        &CancellationToken::default(),
    )
}
