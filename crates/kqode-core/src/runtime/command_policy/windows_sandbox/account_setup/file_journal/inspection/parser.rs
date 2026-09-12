use super::super::{
    super::WindowsSandboxAccountPlan,
    progress::Progress,
    records::{FORMAT_VERSION, MAX_RECORD_BYTES},
};
use super::{SandboxAccountJournalInspection, wire::StoredRecord};
use std::io;

pub(super) const MAX_RECORDS: usize = 12;
pub(super) const MAX_JOURNAL_BYTES: usize = MAX_RECORDS * MAX_RECORD_BYTES;

/// Never discards a torn tail or returns a success-shaped prefix of a corrupt journal.
pub(super) fn parse(
    bytes: &[u8],
    expected: &WindowsSandboxAccountPlan,
) -> io::Result<SandboxAccountJournalInspection> {
    if bytes.is_empty() || bytes.len() > MAX_JOURNAL_BYTES || bytes.last() != Some(&b'\n') {
        return Err(invalid("empty, oversized or unterminated account journal"));
    }
    let mut progress = None;
    for (index, line) in bytes[..bytes.len() - 1]
        .split(|byte| *byte == b'\n')
        .enumerate()
    {
        if index >= MAX_RECORDS || line.is_empty() || line.len() >= MAX_RECORD_BYTES {
            return Err(invalid("account journal record count or length is invalid"));
        }
        let row: StoredRecord = serde_json::from_slice(line)
            .map_err(|_| invalid("invalid account journal record schema"))?;
        match row {
            StoredRecord::Begin {
                version,
                sequence,
                plan,
                mut passwords,
            } if index == 0 && sequence == 0 && version == FORMAT_VERSION => {
                plan.validate(expected)?;
                passwords.validate(expected)?;
                progress = Some(Progress::new(expected.clone()));
            }
            StoredRecord::Checkpoint {
                version,
                sequence,
                checkpoint,
            } if index != 0 && sequence as usize == index && version == FORMAT_VERSION => {
                let current = progress
                    .take()
                    .ok_or_else(|| invalid("journal header is missing"))?;
                progress = Some(current.advance(&checkpoint.convert()?).map_err(|_| {
                    invalid("invalid account journal checkpoint order or identity")
                })?);
            }
            _ => {
                return Err(invalid(
                    "invalid account journal version, sequence or record kind",
                ));
            }
        }
    }
    Ok(progress
        .ok_or_else(|| invalid("journal header is missing"))?
        .inspection())
}

pub(super) fn invalid(message: &'static str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message)
}
