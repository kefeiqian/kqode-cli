use super::super::{
    super::{SandboxAccountJournal, tests::support::FakeHost, workflow},
    PrivateSandboxAccountJournal,
};
use super::support::*;
use crate::cancellation::CancellationToken;
use std::{
    fs::{self, File},
    time::Duration,
};

#[test]
fn real_file_journal_persists_the_fake_account_workflow_and_complete_jsonl_shape() {
    let fixture = Fixture::new();
    let (plan, _) = credentials();
    let mut journal = PrivateSandboxAccountJournal::new(fixture.parent()).unwrap();
    assert_eq!(fs::read_dir(&fixture.0).unwrap().count(), 0);
    let result = workflow::run(
        &plan,
        &mut FakeHost::default(),
        &mut journal,
        Duration::from_secs(15),
        &CancellationToken::default(),
    )
    .unwrap();
    assert!(File::open(fixture.journal(&plan)).is_err());
    assert!(fs::rename(fixture.directory(&plan), fixture.0.join("moved")).is_err());
    drop(journal);
    let bytes = fs::read(fixture.journal(&plan)).unwrap();
    assert_eq!(bytes.last(), Some(&b'\n'));
    let rows: Vec<serde_json::Value> = std::str::from_utf8(&bytes)
        .unwrap()
        .lines()
        .map(|line| serde_json::from_str(line).unwrap())
        .collect();
    assert_eq!(rows.len(), 12);
    for (index, row) in rows.iter().enumerate() {
        assert_eq!(row["version"], 1);
        assert_eq!(row["sequence"], index);
    }
    assert_eq!(rows[0]["kind"], "begin");
    assert_eq!(rows[0]["plan"], serde_json::to_value(&plan).unwrap());
    assert_eq!(rows[0]["passwords"]["version"], 1);
    assert!(rows[0]["passwords"]["offline"].is_array());
    assert!(rows[0]["passwords"]["online"].is_array());
    for (row, checkpoint) in rows[1..].iter().zip(checkpoints(&plan)) {
        assert_eq!(row["kind"], "checkpoint");
        assert_eq!(row["checkpoint"], serde_json::to_value(checkpoint).unwrap());
    }
    assert_eq!(
        rows[11]["checkpoint"]["identities"],
        serde_json::to_value(result.identities()).unwrap()
    );
}

#[test]
fn existing_directory_is_never_adopted_or_truncated_even_after_successful_setup() {
    let fixture = Fixture::new();
    let (plan, passwords) = credentials();
    let mut first = PrivateSandboxAccountJournal::new(fixture.parent()).unwrap();
    first.begin(&plan, &passwords).unwrap();
    drop(first);
    let before = fs::read(fixture.journal(&plan)).unwrap();
    let mut second = PrivateSandboxAccountJournal::new(fixture.parent()).unwrap();
    assert!(second.begin(&plan, &passwords).is_err());
    assert!(second.record(&checkpoints(&plan)[0]).is_err());
    assert_eq!(fs::read(fixture.journal(&plan)).unwrap(), before);
}

#[test]
fn unfinished_directory_and_regular_file_collisions_are_preserved() {
    for directory in [false, true] {
        let fixture = Fixture::new();
        let (plan, passwords) = credentials();
        let target = fixture.directory(&plan);
        if directory {
            fs::create_dir(&target).unwrap();
        } else {
            fs::write(&target, b"untouched").unwrap();
        }
        let mut journal = PrivateSandboxAccountJournal::new(fixture.parent()).unwrap();
        assert!(journal.begin(&plan, &passwords).is_err());
        if directory {
            assert_eq!(fs::read_dir(target).unwrap().count(), 0);
        } else {
            assert_eq!(fs::read(target).unwrap(), b"untouched");
        }
    }
}

#[test]
fn non_directory_parent_is_rejected_without_modification() {
    let fixture = Fixture::new();
    let path = fixture.0.join("file");
    fs::write(&path, b"untouched").unwrap();
    assert!(PrivateSandboxAccountJournal::new(File::open(&path).unwrap()).is_err());
    assert_eq!(fs::read(path).unwrap(), b"untouched");
}

#[test]
fn record_before_begin_and_repeated_begin_poison_without_appending() {
    let fixture = Fixture::new();
    let (plan, passwords) = credentials();
    let mut journal = PrivateSandboxAccountJournal::new(fixture.parent()).unwrap();
    assert!(journal.record(&checkpoints(&plan)[0]).is_err());
    assert!(journal.begin(&plan, &passwords).is_err());
    assert_eq!(fs::read_dir(&fixture.0).unwrap().count(), 0);
    let mut journal = PrivateSandboxAccountJournal::new(fixture.parent()).unwrap();
    journal.begin(&plan, &passwords).unwrap();
    assert!(journal.begin(&plan, &passwords).is_err());
    assert!(journal.record(&checkpoints(&plan)[0]).is_err());
    drop(journal);
    assert_eq!(
        fs::read_to_string(fixture.journal(&plan))
            .unwrap()
            .lines()
            .count(),
        1
    );
}

#[test]
fn cancellation_keeps_the_last_successful_sid_receipt_on_disk() {
    let fixture = Fixture::new();
    let (plan, _) = credentials();
    let cancellation = CancellationToken::default();
    let mut host = FakeHost {
        cancel_after_create: Some((
            super::super::super::SandboxAccountRole::Offline,
            cancellation.clone(),
        )),
        ..Default::default()
    };
    let mut journal = PrivateSandboxAccountJournal::new(fixture.parent()).unwrap();
    assert!(matches!(
        workflow::run(
            &plan,
            &mut host,
            &mut journal,
            Duration::from_secs(15),
            &cancellation
        ),
        Err(super::super::super::SandboxAccountSetupError::Cancelled)
    ));
    drop(journal);
    let contents = fs::read_to_string(fixture.journal(&plan)).unwrap();
    let rows: Vec<serde_json::Value> = contents
        .lines()
        .map(|line| serde_json::from_str(line).unwrap())
        .collect();
    assert_eq!(rows.len(), 5);
    assert_eq!(rows[4]["checkpoint"]["stage"], "created");
    assert_eq!(rows[4]["checkpoint"]["identity"]["role"], "offline");
    assert_eq!(host.entries.len(), 2);
    assert!(host.members.is_empty());
}
