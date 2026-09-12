use super::super::{
    super::{SandboxAccountCheckpoint as Checkpoint, SandboxAccountRole as Role},
    session::Session,
};
use super::support::*;

#[test]
fn every_out_of_order_or_repeated_checkpoint_is_terminal_without_writing() {
    let (plan, passwords) = credentials();
    let records = checkpoints(&plan);
    for position in 0..=records.len() {
        for wrong in 0..records.len() {
            if position == wrong {
                continue;
            }
            let mut session = Session::default();
            session.begin(&plan, &passwords, |_| Ok(())).unwrap();
            for checkpoint in &records[..position] {
                session.record(checkpoint, |_| Ok(())).unwrap();
            }
            assert!(
                session
                    .record(&records[wrong], |_| panic!(
                        "invalid record reached storage"
                    ))
                    .is_err()
            );
            assert!(
                session
                    .record(&records[0], |_| panic!("poisoned session wrote"))
                    .is_err()
            );
        }
    }
}

#[test]
fn mismatched_names_roles_duplicate_sids_and_final_receipts_are_rejected() {
    let (plan, passwords) = credentials();
    let records = checkpoints(&plan);
    for corruption in 0..5 {
        let mut bad = records.clone();
        match corruption {
            0 => {
                if let Checkpoint::Created { identity } = &mut bad[1] {
                    identity.name.push('x');
                }
            }
            1 => {
                if let Checkpoint::Created { identity } = &mut bad[1] {
                    identity.role = Role::Offline;
                }
            }
            2 => {
                if let Checkpoint::Created { identity } = &mut bad[1] {
                    identity.sid.clear();
                }
            }
            3 => {
                let Checkpoint::Created { identity } = &records[1] else {
                    unreachable!()
                };
                let sid = identity.sid.clone();
                if let Checkpoint::Created { identity } = &mut bad[3] {
                    identity.sid = sid;
                }
            }
            _ => {
                if let Checkpoint::PreparedDisabled { identities } = &mut bad[10] {
                    identities.reverse();
                }
            }
        }
        let mut session = Session::default();
        session.begin(&plan, &passwords, |_| Ok(())).unwrap();
        let mut failed = false;
        for (checkpoint, expected) in bad.iter().zip(&records) {
            let differs = serde_json::to_value(checkpoint).unwrap()
                != serde_json::to_value(expected).unwrap();
            let result = session.record(checkpoint, |_| {
                assert!(!differs);
                Ok(())
            });
            if result.is_err() {
                assert!(differs);
                failed = true;
                break;
            }
        }
        assert!(failed);
    }
}
