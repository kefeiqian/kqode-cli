use super::super::{
    ProtectedSandboxPasswords, SandboxAccountCheckpoint, WindowsSandboxAccountPlan,
};
use serde::Serialize;
use std::{
    fs::File,
    io::{self, Write},
};

const FORMAT_VERSION: u32 = 1;
pub(super) const MAX_RECORD_BYTES: usize = 64 * 1024;

#[derive(Serialize)]
pub(super) struct Record<'a> {
    version: u32,
    sequence: u32,
    #[serde(flatten)]
    payload: Payload<'a>,
}

#[derive(Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
enum Payload<'a> {
    Begin {
        plan: &'a WindowsSandboxAccountPlan,
        passwords: &'a ProtectedSandboxPasswords,
    },
    Checkpoint {
        checkpoint: &'a SandboxAccountCheckpoint,
    },
}

impl<'a> Record<'a> {
    pub fn begin(
        plan: &'a WindowsSandboxAccountPlan,
        passwords: &'a ProtectedSandboxPasswords,
    ) -> Self {
        Self {
            version: FORMAT_VERSION,
            sequence: 0,
            payload: Payload::Begin { plan, passwords },
        }
    }

    pub fn checkpoint(sequence: u32, checkpoint: &'a SandboxAccountCheckpoint) -> Self {
        Self {
            version: FORMAT_VERSION,
            sequence,
            payload: Payload::Checkpoint { checkpoint },
        }
    }
}

pub(super) trait DurableWrite: Write {
    fn sync_all(&mut self) -> io::Result<()>;
}

impl DurableWrite for File {
    fn sync_all(&mut self) -> io::Result<()> {
        File::sync_all(self)
    }
}

/// Acknowledges only a complete newline-delimited record followed by a successful disk flush.
pub(super) fn append(writer: &mut impl DurableWrite, record: &Record<'_>) -> io::Result<()> {
    let mut bytes = serde_json::to_vec(record).map_err(io::Error::other)?;
    if bytes.len() >= MAX_RECORD_BYTES {
        return Err(io::Error::other(
            "sandbox account journal record exceeds its byte limit",
        ));
    }
    bytes.push(b'\n');
    writer.write_all(&bytes)?;
    writer.flush()?;
    writer.sync_all()
}
