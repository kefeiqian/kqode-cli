use super::super::super::{
    PrivateSandboxAccountJournal, SandboxAccountJournalState, tests::support::FakeHost, workflow,
};
use super::support::*;
use std::fs;

#[test]
fn initialized_store_reopens_with_the_same_plan_and_supports_fake_account_preparation() {
    let fixture = Fixture::new();
    let first = store(&fixture, true).unwrap();
    let id = first.plan().installation_id().to_owned();
    assert_eq!(fs::read_dir(fixture.0.join(DIRECTORY)).unwrap().count(), 1);
    let token = CancellationToken::default();
    let guard = Guard::new(Duration::from_secs(15), &token).unwrap();
    let mut journal = PrivateSandboxAccountJournal::new(first.root.try_clone().unwrap()).unwrap();
    workflow::run_guarded(first.plan(), &mut FakeHost::default(), &mut journal, &guard).unwrap();
    drop(journal);
    let report = first.inspect(Duration::from_secs(15), &token).unwrap();
    assert_eq!(
        report.state(),
        SandboxAccountJournalState::PreparedDisabledRecorded
    );
    drop(first);
    let second = store(&fixture, false).unwrap();
    assert_eq!(second.plan().installation_id(), id);
    assert_eq!(
        second
            .inspect(Duration::from_secs(15), &token)
            .unwrap()
            .record_count(),
        12
    );
}

#[test]
fn missing_or_existing_unmarked_names_are_not_created_adopted_or_repaired() {
    let fixture = Fixture::new();
    assert!(store(&fixture, false).is_err());
    assert_eq!(fs::read_dir(&fixture.0).unwrap().count(), 0);
    fs::create_dir(fixture.0.join(DIRECTORY)).unwrap();
    assert!(store(&fixture, true).is_err());
    assert!(store(&fixture, false).is_err());
    assert_eq!(fs::read_dir(fixture.0.join(DIRECTORY)).unwrap().count(), 0);
}

#[test]
fn initialization_is_create_new_and_live_handles_prevent_marker_replacement() {
    let fixture = Fixture::new();
    let first = store(&fixture, true).unwrap();
    let marker = fixture.0.join(DIRECTORY).join(FILENAME);
    let before = fs::read(&marker).unwrap();
    assert!(store(&fixture, true).is_err());
    assert!(fs::write(&marker, b"replacement").is_err());
    assert!(fs::rename(fixture.0.join(DIRECTORY), fixture.0.join("moved")).is_err());
    assert_eq!(fs::read(&marker).unwrap(), before);
    drop(first);
    assert!(store(&fixture, false).is_ok());
}

#[test]
fn malformed_mismatched_duplicate_or_torn_markers_remain_untouched() {
    for variant in 0..7 {
        let fixture = Fixture::new();
        drop(store(&fixture, true).unwrap());
        let path = fixture.0.join(DIRECTORY).join(FILENAME);
        let mut value: serde_json::Value =
            serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
        match variant {
            0 => value["version"] = serde_json::json!(2),
            1 => value["owner_sid"] = serde_json::json!("wrong"),
            2 => value["installation_id"] = serde_json::json!(uuid::Uuid::nil().to_string()),
            3 => value["application"] = serde_json::json!("other"),
            4 => value["DO_NOT_ECHO"] = serde_json::json!(true),
            _ => {}
        }
        let mut text = serde_json::to_string(&value).unwrap();
        if variant == 5 {
            text.insert_str(1, "\"version\":1,");
        }
        if variant != 6 {
            text.push('\n');
        }
        fs::write(&path, &text).unwrap();
        let error = store(&fixture, false).err().unwrap();
        assert!(!format!("{error:?}").contains("DO_NOT_ECHO"));
        assert_eq!(fs::read_to_string(path).unwrap(), text);
    }
}

#[test]
fn cancellation_and_zero_timeouts_prevent_creation_or_sam_dispatch() {
    let fixture = Fixture::new();
    let cancellation = CancellationToken::default();
    cancellation.cancel();
    let guard = Guard::new(Duration::from_secs(15), &cancellation).unwrap();
    assert!(matches!(
        Store::at(&fixture.0, true, &guard),
        Err(Error::Cancelled)
    ));
    assert_eq!(fs::read_dir(&fixture.0).unwrap().count(), 0);
    assert!(matches!(
        Store::initialize(Duration::ZERO, &CancellationToken::default()),
        Err(Error::InvalidTimeout)
    ));
    let store = store(&fixture, true).unwrap();
    assert!(matches!(
        store.provision_disabled(Duration::from_secs(15), &cancellation),
        Err(Error::Cancelled)
    ));
    assert_eq!(fs::read_dir(fixture.0.join(DIRECTORY)).unwrap().count(), 1);
}
