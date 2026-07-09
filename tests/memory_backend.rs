//! Integration tests for the backend memory service (U3).
//!
//! Exercise the service against a temp store whose memory root sits beside the
//! DB, covering add/show/edit/forget/list/reload plus the inbox review + undo
//! flow, including cross-scope rejection and secret/oversized refusal.

use kqode::memory::event_log::{InboxProposal, MemoryEvent, append_event};
use kqode::memory::{
    InboxAction, InboxStatus, MemoryError, MemoryScope, MemoryService, MemoryType,
};
use kqode::store::Store;

struct Fixture {
    _dir: tempfile::TempDir,
    store: Store,
    service: MemoryService,
}

fn setup() -> Fixture {
    let dir = tempfile::tempdir().expect("temp dir");
    let store = Store::open_or_bootstrap_at(dir.path().join("kqode.db")).expect("store");
    let workspace = dir.path().join("workspace");
    std::fs::create_dir_all(&workspace).expect("workspace");
    let service = MemoryService::new(store.clone(), &workspace, None).expect("service");
    Fixture {
        _dir: dir,
        store,
        service,
    }
}

#[test]
fn add_creates_active_item_then_lists_and_shows_it() {
    let fixture = setup();
    let item = fixture
        .service
        .add(
            MemoryScope::User,
            None,
            MemoryType::User,
            "Prefer tabs".to_owned(),
            "Use tabs in Go files.".to_owned(),
        )
        .expect("add");

    assert!(item.active);
    assert_eq!(item.scope, MemoryScope::User);
    assert_eq!(item.memory_type, MemoryType::User);

    let listed = fixture.service.list(None, false).expect("list");
    assert!(listed.iter().any(|candidate| candidate.id == item.id));

    let (shown, body) = fixture
        .service
        .show(MemoryScope::User, None, &item.id)
        .expect("show");
    assert_eq!(shown.id, item.id);
    assert_eq!(body, "Use tabs in Go files.");
}

#[test]
fn add_refuses_secret_shaped_content_and_persists_nothing() {
    let fixture = setup();
    let error = fixture
        .service
        .add(
            MemoryScope::User,
            None,
            MemoryType::Reference,
            "token".to_owned(),
            "token = a1b2c3d4e5f6g7h8i9j0k1".to_owned(),
        )
        .expect_err("secret refused");
    assert!(matches!(error, MemoryError::BlockedSensitive(_)));
    assert!(
        fixture.service.list(None, false).expect("list").is_empty(),
        "a refused write leaves no item and no orphan operation"
    );
}

#[test]
fn oversized_body_is_rejected() {
    let fixture = setup();
    let error = fixture
        .service
        .add(
            MemoryScope::User,
            None,
            MemoryType::User,
            "title".to_owned(),
            "x".repeat(40 * 1024),
        )
        .expect_err("too large");
    assert!(matches!(error, MemoryError::PayloadTooLarge("body")));
}

#[test]
fn invalid_title_add_is_refused_with_no_orphan_event() {
    let fixture = setup();
    let error = fixture
        .service
        .add(
            MemoryScope::User,
            None,
            MemoryType::User,
            "   ".to_owned(),
            "body".to_owned(),
        )
        .expect_err("blank title refused");
    assert!(matches!(error, MemoryError::InvalidTitle(_)));
    assert!(
        kqode::memory::event_log::read_events(fixture.service.event_log_path()).is_empty(),
        "a refused invalid-title write must not append any durable operation intent"
    );
    assert!(fixture.service.list(None, false).unwrap().is_empty());
}

#[test]
fn edit_updates_body_and_forget_removes_the_item() {
    let fixture = setup();
    let item = fixture
        .service
        .add(
            MemoryScope::Repo,
            None,
            MemoryType::Decision,
            "Use X".to_owned(),
            "v1".to_owned(),
        )
        .expect("add");

    fixture
        .service
        .edit(
            MemoryScope::Repo,
            None,
            &item.id,
            None,
            Some("v2".to_owned()),
        )
        .expect("edit");
    let (_, body) = fixture
        .service
        .show(MemoryScope::Repo, None, &item.id)
        .expect("show");
    assert_eq!(body, "v2");

    assert!(
        fixture
            .service
            .forget(MemoryScope::Repo, None, &item.id)
            .expect("forget")
    );
    assert!(matches!(
        fixture.service.show(MemoryScope::Repo, None, &item.id),
        Err(MemoryError::NotFound)
    ));
}

#[test]
fn show_unknown_id_and_cross_scope_access_are_not_found() {
    let fixture = setup();
    assert!(matches!(
        fixture.service.show(MemoryScope::User, None, "nope"),
        Err(MemoryError::NotFound)
    ));

    let item = fixture
        .service
        .add(
            MemoryScope::User,
            None,
            MemoryType::User,
            "u".to_owned(),
            "b".to_owned(),
        )
        .expect("add");
    // The same id under a different scope root is not reachable.
    assert!(matches!(
        fixture.service.show(MemoryScope::Repo, None, &item.id),
        Err(MemoryError::NotFound)
    ));
}

#[test]
fn reload_rebuilds_the_index_from_files() {
    let fixture = setup();
    let item = fixture
        .service
        .add(
            MemoryScope::User,
            None,
            MemoryType::User,
            "u".to_owned(),
            "b".to_owned(),
        )
        .expect("add");
    let items = fixture.service.reload().expect("reload");
    assert!(items.iter().any(|candidate| candidate.id == item.id));
}

/// Simulates an automatic active-audit update (what U6/U7 will produce) by
/// recording a rollback snapshot + an inbox entry, then verifies undo behavior.
fn seed_active_audit_update(fixture: &Fixture, item_id: &str, updated_hash: &str) -> String {
    let op = "op-auto";
    append_event(
        fixture.service.event_log_path(),
        &MemoryEvent::RollbackPoint {
            operation_id: op.to_owned(),
            item_id: item_id.to_owned(),
            scope: MemoryScope::User,
            scope_id: None,
            memory_type: MemoryType::Project,
            title: "Setup".to_owned(),
            body: "v1".to_owned(),
            active: true,
            at_ms: 1,
        },
    )
    .expect("rollback event");
    let entry_id = "entry-1".to_owned();
    append_event(
        fixture.service.event_log_path(),
        &MemoryEvent::InboxProposed {
            data: InboxProposal {
                entry_id: entry_id.clone(),
                status: InboxStatus::ActiveAudit,
                scope: MemoryScope::User,
                scope_id: None,
                target_item_id: Some(item_id.to_owned()),
                memory_type: Some(MemoryType::Project),
                title: Some("Setup".to_owned()),
                confidence: Some(0.9),
                source_session_id: None,
                source_turn_start: None,
                source_turn_end: None,
                operation_id: Some(op.to_owned()),
                base_hash: None,
                result_hash: Some(updated_hash.to_owned()),
                reason: None,
                at_ms: 2,
            },
        },
    )
    .expect("inbox event");
    fixture.service.reload().expect("reload");
    entry_id
}

#[test]
fn inbox_undo_restores_prior_content_when_no_conflict() {
    let fixture = setup();
    let item = fixture
        .service
        .add(
            MemoryScope::User,
            None,
            MemoryType::Project,
            "Setup".to_owned(),
            "v1".to_owned(),
        )
        .expect("add");
    let updated = fixture
        .service
        .edit(
            MemoryScope::User,
            None,
            &item.id,
            None,
            Some("v2".to_owned()),
        )
        .expect("auto edit");
    let entry_id = seed_active_audit_update(&fixture, &item.id, &updated.content_hash);

    let (entry, restored) = fixture.service.inbox_undo(&entry_id).expect("undo");
    assert!(restored);
    assert_eq!(entry.status, InboxStatus::Undone);
    let (_, body) = fixture
        .service
        .show(MemoryScope::User, None, &item.id)
        .expect("show");
    assert_eq!(body, "v1", "undo restored the prior content");
}

#[test]
fn inbox_undo_refuses_when_a_later_edit_conflicts() {
    let fixture = setup();
    let item = fixture
        .service
        .add(
            MemoryScope::User,
            None,
            MemoryType::Project,
            "Setup".to_owned(),
            "v1".to_owned(),
        )
        .expect("add");
    let updated = fixture
        .service
        .edit(
            MemoryScope::User,
            None,
            &item.id,
            None,
            Some("v2".to_owned()),
        )
        .expect("auto edit");
    let entry_id = seed_active_audit_update(&fixture, &item.id, &updated.content_hash);
    // A later user edit changes the item after the audited update.
    fixture
        .service
        .edit(
            MemoryScope::User,
            None,
            &item.id,
            None,
            Some("v3".to_owned()),
        )
        .expect("user edit");

    let (entry, restored) = fixture.service.inbox_undo(&entry_id).expect("undo");
    assert!(!restored, "a later conflicting edit blocks undo");
    assert_eq!(entry.status, InboxStatus::Failed);
    let (_, body) = fixture
        .service
        .show(MemoryScope::User, None, &item.id)
        .expect("show");
    assert_eq!(body, "v3", "the later edit is preserved");
}

#[test]
fn inbox_reject_marks_rejected_and_records_a_suppression_key() {
    let fixture = setup();
    append_event(
        fixture.service.event_log_path(),
        &MemoryEvent::InboxProposed {
            data: InboxProposal {
                entry_id: "cand-1".to_owned(),
                status: InboxStatus::Candidate,
                scope: MemoryScope::User,
                scope_id: None,
                target_item_id: None,
                memory_type: Some(MemoryType::User),
                title: Some("inferred preference".to_owned()),
                confidence: Some(0.3),
                source_session_id: None,
                source_turn_start: None,
                source_turn_end: None,
                operation_id: None,
                base_hash: None,
                result_hash: None,
                reason: None,
                at_ms: 1,
            },
        },
    )
    .expect("inbox event");
    fixture.service.reload().expect("reload");

    let entry = fixture
        .service
        .inbox_apply("cand-1", InboxAction::Reject)
        .expect("reject");
    assert_eq!(entry.status, InboxStatus::Rejected);

    // A correction suppression key exists so the rejected candidate is not recreated.
    let corrections_exist = fixture
        .store
        .list_inbox_entries(Some(InboxStatus::Rejected))
        .expect("list")
        .len();
    assert_eq!(corrections_exist, 1);
}
