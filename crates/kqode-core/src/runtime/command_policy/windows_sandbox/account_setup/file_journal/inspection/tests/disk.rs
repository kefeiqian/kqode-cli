use super::super::SandboxAccountJournalState;
use super::support::*;
use std::{fs, fs::OpenOptions, io::Write};

#[test]
fn completed_journal_is_inspected_without_modification_or_exposing_passwords() {
    let (fixture, plan) = disk();
    let before = fs::read(fixture.journal(&plan)).unwrap();
    let report = Journal::inspect(&fixture.parent(), &plan).unwrap();
    assert_eq!(
        report.state(),
        SandboxAccountJournalState::PreparedDisabledRecorded
    );
    assert_eq!(report.record_count(), 12);
    assert_eq!(fs::read(fixture.journal(&plan)).unwrap(), before);
    assert_eq!(fs::read_dir(fixture.directory(&plan)).unwrap().count(), 1);
    assert!(
        !serde_json::to_string(&report)
            .unwrap()
            .contains("passwords")
    );
}

#[test]
fn missing_torn_and_active_journals_are_not_repaired_or_read_through() {
    let fixture = Fixture::new();
    let (plan, passwords) = credentials();
    assert!(Journal::inspect(&fixture.parent(), &plan).is_err());
    assert_eq!(fs::read_dir(&fixture.0).unwrap().count(), 0);
    let mut writer = Journal::new(fixture.parent()).unwrap();
    writer.begin(&plan, &passwords).unwrap();
    assert!(Journal::inspect(&fixture.parent(), &plan).is_err());
    drop(writer);
    let path = fixture.journal(&plan);
    let mut bytes = fs::read(&path).unwrap();
    bytes.pop();
    fs::write(&path, &bytes).unwrap();
    assert!(Journal::inspect(&fixture.parent(), &plan).is_err());
    assert_eq!(fs::read(&path).unwrap(), bytes);
}

#[test]
fn hardlinks_and_file_or_directory_named_streams_are_rejected() {
    for variant in 0..3 {
        let (fixture, plan) = disk();
        match variant {
            0 => fs::hard_link(fixture.journal(&plan), fixture.0.join("alias")).unwrap(),
            _ => {
                let target = if variant == 1 {
                    fixture.journal(&plan)
                } else {
                    fixture.directory(&plan)
                };
                OpenOptions::new()
                    .create_new(true)
                    .write(true)
                    .open(format!("{}:extra", target.display()))
                    .unwrap()
                    .write_all(b"extra")
                    .unwrap();
            }
        }
        assert!(Journal::inspect(&fixture.parent(), &plan).is_err());
    }
}
