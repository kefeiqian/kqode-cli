use super::super::marker::MAX_BYTES;
use super::support::*;
use std::fs;

#[test]
fn a_private_store_missing_its_marker_is_not_reinitialized() {
    let fixture = Fixture::new();
    drop(store(&fixture, true).unwrap());
    let root = fixture.0.join(DIRECTORY);
    fs::remove_file(root.join(FILENAME)).unwrap();
    assert!(store(&fixture, false).is_err());
    assert!(store(&fixture, true).is_err());
    assert_eq!(fs::read_dir(root).unwrap().count(), 0);
}

#[test]
fn marker_byte_limit_includes_terminating_newline_and_never_truncates() {
    let fixture = Fixture::new();
    drop(store(&fixture, true).unwrap());
    let path = fixture.0.join(DIRECTORY).join(FILENAME);
    let mut bytes = fs::read(&path).unwrap();
    bytes.pop();
    bytes.resize(MAX_BYTES as usize - 1, b' ');
    bytes.push(b'\n');
    fs::write(&path, &bytes).unwrap();
    drop(store(&fixture, false).unwrap());
    assert_eq!(fs::read(&path).unwrap(), bytes);
    bytes.push(b'\n');
    fs::write(&path, &bytes).unwrap();
    assert!(store(&fixture, false).is_err());
    assert_eq!(fs::read(&path).unwrap(), bytes);
}

#[test]
fn expired_store_operations_do_not_create_an_account_journal() {
    let fixture = Fixture::new();
    let store = store(&fixture, true).unwrap();
    let token = CancellationToken::default();
    for error in [
        store
            .provision_disabled(Duration::ZERO, &token)
            .err()
            .unwrap(),
        store.inspect(Duration::ZERO, &token).err().unwrap(),
        store.reconcile(Duration::ZERO, &token).err().unwrap(),
    ] {
        assert!(matches!(error, Error::InvalidTimeout));
    }
    assert_eq!(fs::read_dir(fixture.0.join(DIRECTORY)).unwrap().count(), 1);
}
