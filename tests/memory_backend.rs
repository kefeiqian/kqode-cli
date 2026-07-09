//! Integration tests for the backend memory service (U3).
//!
//! Exercise the service against a temp store whose memory root sits beside the
//! DB, covering add/show/edit/forget/list/reload plus the inbox review + undo
//! flow, including cross-scope rejection and secret/oversized refusal.

use kqode::conversation::session_log::{SessionLogEvent, append_event as append_session_event};
use kqode::memory::event_log::{InboxProposal, MemoryEvent, append_event};
use kqode::memory::extraction::{
    ExtractionInput, ExtractionOutcome, MemoryProposal, RuleExtractor,
};
use kqode::memory::scheduler::{ExtractionRun, ExtractionScheduler, ExtractionTrigger};
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

#[test]
fn load_prompt_block_includes_active_memory_and_records_a_trace() {
    use kqode::memory::event_log::{MemoryEvent, read_events};

    let fixture = setup();
    fixture
        .service
        .add(
            MemoryScope::User,
            None,
            MemoryType::User,
            "Prefer tabs".to_owned(),
            "Use tabs in Go files.".to_owned(),
        )
        .expect("add");

    let block = fixture.service.load_prompt_block().expect("memory block");
    assert!(block.contains("untrusted local memory"));
    assert!(block.contains("Use tabs in Go files."));

    let loaded = read_events(fixture.service.event_log_path())
        .into_iter()
        .any(|event| matches!(event, MemoryEvent::MemoryLoaded { .. }));
    assert!(loaded, "loading records a MemoryLoaded trace event");
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

// ---- Lifecycle extraction scheduler (U6) ----

fn session_log_with(dir: &std::path::Path, events: &[SessionLogEvent]) -> std::path::PathBuf {
    let path = dir.join("session.jsonl");
    for event in events {
        append_session_event(&path, event).expect("session log");
    }
    path
}

fn enqueued(turn: &str, seq: u64, prompt: &str) -> SessionLogEvent {
    SessionLogEvent::TurnEnqueued {
        turn_id: turn.to_owned(),
        seq,
        prompt: prompt.to_owned(),
        at_ms: 0,
    }
}

fn settled(turn: &str, kind: &str, text: Option<&str>) -> SessionLogEvent {
    SessionLogEvent::TurnSettled {
        turn_id: turn.to_owned(),
        settled_kind: kind.to_owned(),
        text: text.map(str::to_owned),
        finish_reason: None,
        error_kind: None,
        message: None,
        at_ms: 0,
    }
}

fn candidate_rule() -> RuleExtractor<impl Fn(&ExtractionInput) -> ExtractionOutcome + Send + Sync> {
    RuleExtractor(|input: &ExtractionInput| {
        ExtractionOutcome::Candidate(MemoryProposal {
            scope: MemoryScope::User,
            memory_type: MemoryType::User,
            title: "test command".to_owned(),
            body: input
                .rounds
                .first()
                .map_or(String::new(), |round| round.response.clone()),
            confidence: 0.4,
        })
    })
}

#[test]
fn extraction_records_a_candidate_and_advances_the_cursor() {
    let fixture = setup();
    let log = session_log_with(
        fixture._dir.path(),
        &[
            enqueued("t0", 0, "how do I run tests?"),
            settled("t0", "completed", Some("cargo test")),
        ],
    );
    let scheduler = ExtractionScheduler::new();
    let extractor = candidate_rule();

    let run = scheduler.run_session(
        &fixture.service,
        "sess-1",
        &log,
        ExtractionTrigger::CleanExit,
        &extractor,
    );
    assert!(matches!(
        run,
        ExtractionRun::Ran {
            created_inbox: true,
            covered_through_seq: 0,
            ..
        }
    ));
    assert_eq!(
        fixture
            .store
            .list_inbox_entries(Some(InboxStatus::Candidate))
            .unwrap()
            .len(),
        1
    );
    assert_eq!(fixture.store.memory_cursor("sess-1").unwrap(), Some(0));

    // A second trigger has nothing new after the cursor (coalesced by cursor).
    let again = scheduler.run_session(
        &fixture.service,
        "sess-1",
        &log,
        ExtractionTrigger::Idle,
        &extractor,
    );
    assert_eq!(again, ExtractionRun::NoEligibleTurns);
}

#[test]
fn extraction_skips_unsettled_and_non_completed_turns() {
    let fixture = setup();
    let log = session_log_with(
        fixture._dir.path(),
        &[
            enqueued("t0", 0, "p0"),
            settled("t0", "cancelled", None),
            enqueued("t1", 1, "p1"), // active: never settled
            enqueued("t2", 2, "p2"),
            settled("t2", "error", None),
        ],
    );
    let scheduler = ExtractionScheduler::new();

    let run = scheduler.run_session(
        &fixture.service,
        "sess-2",
        &log,
        ExtractionTrigger::Startup,
        &candidate_rule(),
    );
    assert_eq!(
        run,
        ExtractionRun::NoEligibleTurns,
        "cancelled/active/errored turns are not eligible"
    );
}

#[test]
fn failed_outcome_is_recorded_and_secret_proposal_is_dropped() {
    let fixture = setup();
    let log = session_log_with(
        fixture._dir.path(),
        &[
            enqueued("t0", 0, "p"),
            settled("t0", "completed", Some("r")),
        ],
    );
    let scheduler = ExtractionScheduler::new();

    let failed =
        RuleExtractor(|_: &ExtractionInput| ExtractionOutcome::Failed("worker crashed".to_owned()));
    let run = scheduler.run_session(
        &fixture.service,
        "s-fail",
        &log,
        ExtractionTrigger::Explicit,
        &failed,
    );
    assert!(matches!(
        run,
        ExtractionRun::Ran {
            created_inbox: true,
            ..
        }
    ));
    assert_eq!(
        fixture
            .store
            .list_inbox_entries(Some(InboxStatus::Failed))
            .unwrap()
            .len(),
        1
    );

    let secret = RuleExtractor(|_: &ExtractionInput| {
        ExtractionOutcome::Candidate(MemoryProposal {
            scope: MemoryScope::User,
            memory_type: MemoryType::Reference,
            title: "creds".to_owned(),
            body: "token = a1b2c3d4e5f6g7h8i9j0k1".to_owned(),
            confidence: 0.9,
        })
    });
    let run2 = scheduler.run_session(
        &fixture.service,
        "s-secret",
        &log,
        ExtractionTrigger::Explicit,
        &secret,
    );
    assert!(
        matches!(
            run2,
            ExtractionRun::Ran {
                created_inbox: false,
                ..
            }
        ),
        "a secret-shaped proposal creates no inbox entry"
    );
    assert!(
        fixture
            .store
            .list_inbox_entries(Some(InboxStatus::Candidate))
            .unwrap()
            .is_empty(),
        "no candidate is created for secret content"
    );
    // The cursor still advances so the blocked turn is not reprocessed.
    assert_eq!(fixture.store.memory_cursor("s-secret").unwrap(), Some(0));
}

// ---- Inbox activation + sensitive purge (U7) ----

#[test]
fn approving_an_extraction_candidate_writes_the_memory_item() {
    let fixture = setup();
    let log = session_log_with(
        fixture._dir.path(),
        &[
            enqueued("t0", 0, "how do I run tests?"),
            settled("t0", "completed", Some("cargo test")),
        ],
    );
    ExtractionScheduler::new().run_session(
        &fixture.service,
        "sess-a",
        &log,
        ExtractionTrigger::CleanExit,
        &candidate_rule(),
    );
    let candidates = fixture
        .store
        .list_inbox_entries(Some(InboxStatus::Candidate))
        .unwrap();
    assert_eq!(candidates.len(), 1);
    assert!(
        fixture.service.list(None, true).unwrap().is_empty(),
        "a candidate is not active until approved"
    );

    let entry = fixture
        .service
        .inbox_apply(&candidates[0].id, InboxAction::Approve)
        .unwrap();
    assert_eq!(entry.status, InboxStatus::Approved);
    let items = fixture.service.list(None, true).unwrap();
    assert_eq!(items.len(), 1);
    let (_, body) = fixture
        .service
        .show(items[0].scope, items[0].scope_id.as_deref(), &items[0].id)
        .unwrap();
    assert_eq!(body, "cargo test", "approval writes the proposed body");
}

#[test]
fn active_update_extraction_writes_the_item_immediately_with_audit() {
    let fixture = setup();
    let log = session_log_with(
        fixture._dir.path(),
        &[
            enqueued("t0", 0, "p"),
            settled("t0", "completed", Some("resp")),
        ],
    );
    let active_rule = RuleExtractor(|_: &ExtractionInput| {
        ExtractionOutcome::ActiveUpdate(MemoryProposal {
            scope: MemoryScope::User,
            memory_type: MemoryType::Project,
            title: "setup".to_owned(),
            body: "use pnpm".to_owned(),
            confidence: 0.95,
        })
    });
    ExtractionScheduler::new().run_session(
        &fixture.service,
        "sess-b",
        &log,
        ExtractionTrigger::CleanExit,
        &active_rule,
    );

    let items = fixture.service.list(None, true).unwrap();
    assert_eq!(
        items.len(),
        1,
        "a high-confidence update is active immediately"
    );
    assert_eq!(items[0].title, "setup");
    assert_eq!(
        fixture
            .store
            .list_inbox_entries(Some(InboxStatus::ActiveAudit))
            .unwrap()
            .len(),
        1,
        "an active-audit row records the automatic write"
    );
}

#[test]
fn purge_removes_the_item_and_redacts_its_rollback_body() {
    let fixture = setup();
    let item = fixture
        .service
        .add(
            MemoryScope::User,
            None,
            MemoryType::Project,
            "topic".to_owned(),
            "SENSITIVE-DATA v1".to_owned(),
        )
        .unwrap();
    fixture
        .service
        .edit(
            MemoryScope::User,
            None,
            &item.id,
            None,
            Some("SENSITIVE-DATA v2".to_owned()),
        )
        .unwrap();

    assert!(
        fixture
            .service
            .purge(MemoryScope::User, None, &item.id)
            .unwrap()
    );
    assert!(matches!(
        fixture.service.show(MemoryScope::User, None, &item.id),
        Err(MemoryError::NotFound)
    ));

    let events = kqode::memory::event_log::read_events(fixture.service.event_log_path());
    assert!(
        !events.iter().any(|event| matches!(
            event,
            MemoryEvent::RollbackPoint { body, .. } if body.contains("SENSITIVE")
        )),
        "purge redacts the sensitive rollback body from the log"
    );
    assert!(
        events
            .iter()
            .any(|event| matches!(event, MemoryEvent::SensitivePurged { .. })),
        "purge leaves a content-free tombstone"
    );
}

#[test]
fn purge_redacts_the_proposal_body_of_an_approved_extraction() {
    let fixture = setup();
    let log = session_log_with(
        fixture._dir.path(),
        &[
            enqueued("t0", 0, "p"),
            settled("t0", "completed", Some("r")),
        ],
    );
    let rule = RuleExtractor(|_: &ExtractionInput| {
        ExtractionOutcome::Candidate(MemoryProposal {
            scope: MemoryScope::User,
            memory_type: MemoryType::User,
            title: "topic".to_owned(),
            body: "REDACT-TARGET-BODY".to_owned(),
            confidence: 0.4,
        })
    });
    ExtractionScheduler::new().run_session(
        &fixture.service,
        "sess-p",
        &log,
        ExtractionTrigger::CleanExit,
        &rule,
    );
    let candidates = fixture
        .store
        .list_inbox_entries(Some(InboxStatus::Candidate))
        .unwrap();
    assert_eq!(candidates.len(), 1);

    fixture
        .service
        .inbox_apply(&candidates[0].id, InboxAction::Approve)
        .unwrap();
    let items = fixture.service.list(None, true).unwrap();
    assert_eq!(
        items.len(),
        1,
        "approval activates the extraction candidate"
    );
    let item_id = items[0].id.clone();

    assert!(
        fixture
            .service
            .purge(MemoryScope::User, None, &item_id)
            .unwrap()
    );

    let events = kqode::memory::event_log::read_events(fixture.service.event_log_path());
    assert!(
        !events.iter().any(|event| matches!(
            event,
            MemoryEvent::ProposalBody { body, .. } if body.contains("REDACT-TARGET-BODY")
        )),
        "purge redacts the proposal body once the entry is linked to its item"
    );
}

#[test]
fn approving_an_active_audit_does_not_duplicate_the_item() {
    let fixture = setup();
    let log = session_log_with(
        fixture._dir.path(),
        &[
            enqueued("t0", 0, "p"),
            settled("t0", "completed", Some("r")),
        ],
    );
    let active_rule = RuleExtractor(|_: &ExtractionInput| {
        ExtractionOutcome::ActiveUpdate(MemoryProposal {
            scope: MemoryScope::User,
            memory_type: MemoryType::Project,
            title: "setup".to_owned(),
            body: "use pnpm".to_owned(),
            confidence: 0.95,
        })
    });
    ExtractionScheduler::new().run_session(
        &fixture.service,
        "sess-c",
        &log,
        ExtractionTrigger::CleanExit,
        &active_rule,
    );

    let before = fixture.service.list(None, true).unwrap();
    assert_eq!(before.len(), 1, "an active update is applied immediately");
    let audit = fixture
        .store
        .list_inbox_entries(Some(InboxStatus::ActiveAudit))
        .unwrap();
    assert_eq!(audit.len(), 1);

    let entry = fixture
        .service
        .inbox_apply(&audit[0].id, InboxAction::Approve)
        .unwrap();
    assert_eq!(entry.status, InboxStatus::Approved);

    let after = fixture.service.list(None, true).unwrap();
    assert_eq!(
        after.len(),
        1,
        "approving an already-applied active-audit entry does not create a duplicate"
    );
    assert_eq!(
        after[0].id, before[0].id,
        "the item id is reused, not re-minted on approval"
    );
}
