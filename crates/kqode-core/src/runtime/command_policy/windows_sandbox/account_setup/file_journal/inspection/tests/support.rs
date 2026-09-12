pub(super) use super::super::super::super::{
    PrivateSandboxAccountJournal as Journal, SandboxAccountJournal, SandboxAccountRole as Role,
    WindowsSandboxAccountPlan as Plan,
};
use super::super::super::records::Record;
pub(super) use super::super::super::tests::support::{Fixture, checkpoints, credentials};
use serde_json::Value;
use std::fs;

pub fn valid() -> (Plan, Vec<u8>) {
    let (plan, passwords) = credentials();
    let mut bytes = serde_json::to_vec(&Record::begin(&plan, &passwords)).unwrap();
    bytes.push(b'\n');
    for (index, checkpoint) in checkpoints(&plan).iter().enumerate() {
        bytes
            .extend(serde_json::to_vec(&Record::checkpoint(index as u32 + 1, checkpoint)).unwrap());
        bytes.push(b'\n');
    }
    (plan, bytes)
}

pub fn rows(bytes: &[u8]) -> Vec<Value> {
    std::str::from_utf8(bytes)
        .unwrap()
        .lines()
        .map(|line| serde_json::from_str(line).unwrap())
        .collect()
}

pub fn encode(rows: &[Value]) -> Vec<u8> {
    let mut bytes = Vec::new();
    for row in rows {
        bytes.extend(serde_json::to_vec(row).unwrap());
        bytes.push(b'\n');
    }
    bytes
}

pub fn disk() -> (Fixture, Plan) {
    let fixture = Fixture::new();
    let (plan, passwords) = credentials();
    let mut journal = Journal::new(fixture.parent()).unwrap();
    journal.begin(&plan, &passwords).unwrap();
    for checkpoint in checkpoints(&plan) {
        journal.record(&checkpoint).unwrap();
    }
    drop(journal);
    assert!(fs::metadata(fixture.journal(&plan)).unwrap().is_file());
    (fixture, plan)
}
