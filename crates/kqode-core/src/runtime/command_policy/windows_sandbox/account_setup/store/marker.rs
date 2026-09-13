use super::super::{WindowsSandboxAccountPlan as Plan, private_acl::invalid, private_object};
use crate::runtime::{windows_file::open_child, windows_security::PrivateDescriptor};
use serde::{Deserialize, Serialize};
use std::{
    ffi::OsStr,
    fs::File,
    io::{self, Read, Write},
};
use windows_sys::Win32::Storage::FileSystem::FILE_SHARE_READ;

pub(super) const FILENAME: &str = "store.json";
pub(super) const MAX_BYTES: u64 = 4096;
const VERSION: u32 = 1;
const APPLICATION: &str = "com.nincere.kqode.sandbox-accounts";

#[derive(Deserialize, Serialize, Eq, PartialEq)]
#[serde(deny_unknown_fields)]
pub(super) struct Marker {
    version: u32,
    application: String,
    owner_sid: String,
    installation_id: String,
}

impl Marker {
    pub fn fresh(user: &str) -> Self {
        Self {
            version: VERSION,
            application: APPLICATION.into(),
            owner_sid: user.into(),
            installation_id: uuid::Uuid::new_v4().to_string(),
        }
    }

    pub fn plan(&self, user: &str) -> io::Result<Plan> {
        if self.version != VERSION || self.application != APPLICATION || self.owner_sid != user {
            return Err(invalid("storage marker identity or version does not match"));
        }
        let id = uuid::Uuid::parse_str(&self.installation_id)
            .map_err(|_| invalid("invalid storage installation ID"))?;
        if id.to_string() != self.installation_id {
            return Err(invalid("noncanonical storage installation ID"));
        }
        Plan::new(id).map_err(|_| invalid("invalid storage installation ID"))
    }
}

pub(super) fn create(root: &File, marker: &Marker) -> io::Result<()> {
    let descriptor = PrivateDescriptor::new()?;
    let mut file = open_child(
        root,
        OsStr::new(FILENAME),
        Some(false),
        FILE_SHARE_READ,
        Some(&descriptor),
        true,
    )?;
    private_object::verify(&file, false)?;
    let bytes =
        serde_json::to_vec(marker).map_err(|_| invalid("storage marker encoding failed"))?;
    if bytes.len() as u64 >= MAX_BYTES {
        return Err(invalid("storage marker exceeds its byte limit"));
    }
    file.write_all(&bytes)?;
    file.write_all(b"\n")?;
    file.sync_all()
}

pub(super) fn load(root: &File, user: &str) -> io::Result<(File, Marker, Plan)> {
    let mut file = open_child(
        root,
        OsStr::new(FILENAME),
        None,
        FILE_SHARE_READ,
        None,
        true,
    )?;
    private_object::verify(&file, false)?;
    if file.metadata()?.len() > MAX_BYTES {
        return Err(invalid("storage marker exceeds its byte limit"));
    }
    let mut bytes = Vec::new();
    (&mut file).take(MAX_BYTES + 1).read_to_end(&mut bytes)?;
    if bytes.is_empty() || bytes.len() as u64 > MAX_BYTES || bytes.last() != Some(&b'\n') {
        return Err(invalid("empty, oversized or torn storage marker"));
    }
    let marker: Marker =
        serde_json::from_slice(&bytes).map_err(|_| invalid("invalid storage marker schema"))?;
    let plan = marker.plan(user)?;
    private_object::verify(&file, false)?;
    Ok((file, marker, plan))
}
