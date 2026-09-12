use super::super::{
    records::{self, DurableWrite, Record},
    session::Session,
};
use super::support::*;
use std::io::{self, Write};

#[derive(Clone, Copy)]
enum Fault {
    None,
    Write,
    Flush,
    Sync,
}

struct Sink {
    fault: Fault,
    bytes: Vec<u8>,
    flushes: usize,
    syncs: usize,
}

impl Sink {
    fn new(fault: Fault) -> Self {
        Self {
            fault,
            bytes: Vec::new(),
            flushes: 0,
            syncs: 0,
        }
    }
}

impl Write for Sink {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        if matches!(self.fault, Fault::Write) && !self.bytes.is_empty() {
            return Err(io::Error::other("injected write failure"));
        }
        let length = bytes.len().min(7);
        self.bytes.extend_from_slice(&bytes[..length]);
        Ok(length)
    }
    fn flush(&mut self) -> io::Result<()> {
        self.flushes += 1;
        if matches!(self.fault, Fault::Flush) {
            Err(io::Error::other("injected flush failure"))
        } else {
            Ok(())
        }
    }
}

impl DurableWrite for Sink {
    fn sync_all(&mut self) -> io::Result<()> {
        self.syncs += 1;
        if matches!(self.fault, Fault::Sync) {
            Err(io::Error::other("injected disk sync failure"))
        } else {
            Ok(())
        }
    }
}

#[test]
fn short_writes_are_completed_before_newline_and_disk_sync() {
    let (plan, passwords) = credentials();
    let mut sink = Sink::new(Fault::None);
    records::append(&mut sink, &Record::begin(&plan, &passwords)).unwrap();
    assert_eq!(sink.bytes.last(), Some(&b'\n'));
    let parsed: serde_json::Value = serde_json::from_slice(&sink.bytes).unwrap();
    assert_eq!(parsed["plan"], serde_json::to_value(plan).unwrap());
    assert_eq!((sink.flushes, sink.syncs), (1, 1));
}

#[test]
fn partial_write_flush_and_sync_failures_poison_begin_and_each_checkpoint() {
    let (plan, passwords) = credentials();
    let checkpoints = checkpoints(&plan);
    for fault in [Fault::Write, Fault::Flush, Fault::Sync] {
        for position in 0..=checkpoints.len() {
            let mut session = Session::default();
            let mut sink = Sink::new(fault);
            let result = if position == 0 {
                session.begin(&plan, &passwords, |row| records::append(&mut sink, row))
            } else {
                session.begin(&plan, &passwords, |_| Ok(())).unwrap();
                for checkpoint in &checkpoints[..position - 1] {
                    session.record(checkpoint, |_| Ok(())).unwrap();
                }
                session.record(&checkpoints[position - 1], |row| {
                    records::append(&mut sink, row)
                })
            };
            assert!(result.is_err());
            assert!(
                session
                    .record(&checkpoints[0], |_| panic!("poisoned writer continued"))
                    .is_err()
            );
            assert!(
                session
                    .begin(&plan, &passwords, |_| panic!("poisoned writer restarted"))
                    .is_err()
            );
            match fault {
                Fault::Write => assert_eq!((sink.flushes, sink.syncs), (0, 0)),
                Fault::Flush => assert_eq!((sink.flushes, sink.syncs), (1, 0)),
                Fault::Sync => assert_eq!((sink.flushes, sink.syncs), (1, 1)),
                Fault::None => unreachable!(),
            }
        }
    }
}

#[test]
fn oversized_records_are_rejected_before_any_write_or_flush() {
    let (plan, _) = credentials();
    let mut rows = checkpoints(&plan);
    if let super::super::super::SandboxAccountCheckpoint::Created { identity } = &mut rows[1] {
        identity.sid = "x".repeat(64 * 1024);
    }
    let mut sink = Sink::new(Fault::None);
    assert!(records::append(&mut sink, &Record::checkpoint(2, &rows[1])).is_err());
    assert!(sink.bytes.is_empty());
    assert_eq!((sink.flushes, sink.syncs), (0, 0));
}

#[test]
fn record_byte_limit_includes_the_final_newline() {
    let (plan, _) = credentials();
    let mut rows = checkpoints(&plan);
    if let super::super::super::SandboxAccountCheckpoint::Created { identity } = &mut rows[1] {
        identity.sid.clear();
    }
    let overhead = serde_json::to_vec(&Record::checkpoint(2, &rows[1]))
        .unwrap()
        .len();
    if let super::super::super::SandboxAccountCheckpoint::Created { identity } = &mut rows[1] {
        identity.sid = "x".repeat(records::MAX_RECORD_BYTES - overhead - 1);
    }
    let mut sink = Sink::new(Fault::None);
    records::append(&mut sink, &Record::checkpoint(2, &rows[1])).unwrap();
    assert_eq!(sink.bytes.len(), records::MAX_RECORD_BYTES);
    if let super::super::super::SandboxAccountCheckpoint::Created { identity } = &mut rows[1] {
        identity.sid.push('x');
    }
    let mut sink = Sink::new(Fault::None);
    assert!(records::append(&mut sink, &Record::checkpoint(2, &rows[1])).is_err());
    assert!(sink.bytes.is_empty());
    assert_eq!((sink.flushes, sink.syncs), (0, 0));
}
