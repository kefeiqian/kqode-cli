use super::super::super::super::{
    credentials::{COMPLEXITY_PREFIX, PASSWORD_TEXT_BYTES},
    protection,
};
use super::super::parser::parse;
use super::support::*;
use serde_json::json;

#[test]
fn decryptable_but_wrong_password_shapes_are_rejected_without_echoing_plaintext() {
    let (plan, bytes) = valid();
    for payload in [
        b"DO_NOT_ECHO".to_vec(),
        vec![b'x'; PASSWORD_TEXT_BYTES],
        [COMPLEXITY_PREFIX.as_bytes(), &[b'!'; 64]].concat(),
    ] {
        let encrypted = protection::protect(&payload, &plan, Role::Offline).unwrap();
        let mut records = rows(&bytes);
        records[0]["passwords"]["offline"] = json!(encrypted);
        let error = parse(&encode(&records), &plan).unwrap_err();
        assert!(!format!("{error:?}").contains("DO_NOT_ECHO"));
    }
}

#[test]
fn oversized_ciphertext_and_nested_duplicate_password_fields_are_rejected() {
    let (plan, bytes) = valid();
    let mut records = rows(&bytes);
    records[0]["passwords"]["offline"] = json!(vec![0u8; protection::MAX_CIPHERTEXT_BYTES + 1]);
    assert!(parse(&encode(&records), &plan).is_err());
    let mut header = serde_json::to_string(&rows(&bytes)[0]).unwrap();
    let start = header.find("\"passwords\":{").unwrap() + "\"passwords\":{".len();
    header.insert_str(start, "\"version\":1,");
    header.push('\n');
    assert!(parse(header.as_bytes(), &plan).is_err());
}
