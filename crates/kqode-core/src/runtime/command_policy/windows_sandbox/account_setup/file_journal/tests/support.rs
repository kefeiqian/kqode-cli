use super::super::{
    super::{
        SandboxAccountCheckpoint as Checkpoint, SandboxAccountRole as Role,
        WindowsSandboxAccountPlan as Plan, credentials::Passwords, model::ROLES,
        tests::support::FakeHost,
    },
    storage::{JOURNAL_FILENAME, directory_name},
};
use std::{
    fs::{self, File, OpenOptions},
    os::windows::fs::OpenOptionsExt,
    path::PathBuf,
};
use windows_sys::Win32::Storage::FileSystem::{
    FILE_FLAG_BACKUP_SEMANTICS, FILE_FLAG_OPEN_REPARSE_POINT, FILE_SHARE_READ, FILE_SHARE_WRITE,
};

pub struct Fixture(pub PathBuf);

impl Fixture {
    pub fn new() -> Self {
        let path =
            std::env::temp_dir().join(format!("kqode-account-journal-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&path).unwrap();
        Self(path)
    }

    pub fn parent(&self) -> File {
        OpenOptions::new()
            .read(true)
            .write(true)
            .share_mode(FILE_SHARE_READ | FILE_SHARE_WRITE)
            .custom_flags(FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT)
            .open(&self.0)
            .unwrap()
    }

    pub fn directory(&self, plan: &Plan) -> PathBuf {
        self.0.join(directory_name(plan))
    }
    pub fn journal(&self, plan: &Plan) -> PathBuf {
        self.directory(plan).join(JOURNAL_FILENAME)
    }
}

impl Drop for Fixture {
    fn drop(&mut self) {
        if let Err(error) = fs::remove_dir_all(&self.0) {
            eprintln!("account journal fixture cleanup failed: {error}");
        }
    }
}

pub fn credentials() -> (Plan, super::super::super::ProtectedSandboxPasswords) {
    let plan = Plan::new(uuid::Uuid::new_v4()).unwrap();
    let passwords = Passwords::generate().unwrap().protect(&plan).unwrap();
    (plan, passwords)
}

pub fn checkpoints(plan: &Plan) -> Vec<Checkpoint> {
    let identities: Vec<_> = ROLES
        .map(|role| FakeHost::facts(plan, role).identity)
        .into();
    let mut records = Vec::new();
    for identity in &identities {
        records.push(Checkpoint::Creating {
            role: identity.role(),
        });
        records.push(Checkpoint::Created {
            identity: identity.clone(),
        });
    }
    for role in [Role::Offline, Role::Online] {
        records.push(Checkpoint::AddingMember { role });
        records.push(Checkpoint::MemberAdded { role });
    }
    records.push(Checkpoint::PreparedDisabled { identities });
    records
}
