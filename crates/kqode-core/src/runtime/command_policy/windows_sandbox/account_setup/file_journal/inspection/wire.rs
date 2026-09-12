use super::{
    super::super::{
        SandboxAccountCheckpoint as Checkpoint, SandboxAccountIdentity as Identity,
        SandboxAccountRole as Role, WindowsSandboxAccountPlan as Plan,
        credentials::PASSWORD_ENVELOPE_VERSION, protection,
    },
    invalid,
};
use serde::Deserialize;
use std::io;

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub(super) enum StoredRecord {
    Begin {
        version: u32,
        sequence: u32,
        plan: StoredPlan,
        passwords: Envelope,
    },
    Checkpoint {
        version: u32,
        sequence: u32,
        checkpoint: StoredCheckpoint,
    },
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct StoredPlan {
    installation_id: String,
    group: String,
    offline: String,
    online: String,
    marker: String,
}

impl StoredPlan {
    pub fn validate(&self, expected: &Plan) -> io::Result<()> {
        if self.installation_id != expected.installation_id()
            || self.group != expected.name(Role::Group)
            || self.offline != expected.name(Role::Offline)
            || self.online != expected.name(Role::Online)
            || self.marker != expected.marker()
        {
            return Err(invalid(
                "journal plan does not match the expected installation",
            ));
        }
        Ok(())
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Envelope {
    version: u32,
    offline: Vec<u8>,
    online: Vec<u8>,
}

impl Envelope {
    pub fn validate(&mut self, plan: &Plan) -> io::Result<()> {
        if self.version != PASSWORD_ENVELOPE_VERSION {
            return Err(invalid("unsupported journal password version"));
        }
        for (bytes, role) in [
            (&mut self.offline, Role::Offline),
            (&mut self.online, Role::Online),
        ] {
            protection::verify_password(bytes, plan, role)
                .map_err(|_| invalid("journal password verification failed"))?;
        }
        Ok(())
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "snake_case")]
pub(super) enum StoredRole {
    Group,
    Offline,
    Online,
}

impl From<StoredRole> for Role {
    fn from(role: StoredRole) -> Self {
        match role {
            StoredRole::Group => Self::Group,
            StoredRole::Offline => Self::Offline,
            StoredRole::Online => Self::Online,
        }
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct StoredIdentity {
    role: StoredRole,
    name: String,
    sid: String,
}

impl StoredIdentity {
    fn convert(self) -> io::Result<Identity> {
        let parts: Vec<_> = self.sid.split('-').collect();
        if parts.len() != 8
            || parts[..4] != ["S", "1", "5", "21"]
            || !parts[4..].iter().all(|part| {
                part.parse::<u32>()
                    .is_ok_and(|number| number.to_string() == *part)
            })
        {
            return Err(invalid("invalid recorded local account SID"));
        }
        Ok(Identity {
            role: self.role.into(),
            name: self.name,
            sid: self.sid,
        })
    }
}

#[derive(Deserialize)]
#[serde(tag = "stage", rename_all = "snake_case", deny_unknown_fields)]
pub(super) enum StoredCheckpoint {
    Creating { role: StoredRole },
    Created { identity: StoredIdentity },
    AddingMember { role: StoredRole },
    MemberAdded { role: StoredRole },
    PreparedDisabled { identities: Vec<StoredIdentity> },
}

impl StoredCheckpoint {
    pub fn convert(self) -> io::Result<Checkpoint> {
        Ok(match self {
            Self::Creating { role } => Checkpoint::Creating { role: role.into() },
            Self::Created { identity } => Checkpoint::Created {
                identity: identity.convert()?,
            },
            Self::AddingMember { role } => Checkpoint::AddingMember { role: role.into() },
            Self::MemberAdded { role } => Checkpoint::MemberAdded { role: role.into() },
            Self::PreparedDisabled { identities } => Checkpoint::PreparedDisabled {
                identities: identities
                    .into_iter()
                    .map(StoredIdentity::convert)
                    .collect::<io::Result<_>>()?,
            },
        })
    }
}
