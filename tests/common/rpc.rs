use std::{
    io::Write,
    path::Path,
    process::{Command, Output, Stdio},
};

use kqode::protocol::{BACKEND_MODE_ARG, BACKEND_READY_METHOD};
use serde_json::{Value, json};

#[allow(dead_code)]
pub fn backend_output(input: &[u8]) -> Output {
    let home = tempfile::tempdir().expect("backend test home");
    backend_output_in(home.path(), Path::new("."), input)
}

pub fn backend_output_in(home: &Path, cwd: &Path, input: &[u8]) -> Output {
    let mut child = Command::new(env!("CARGO_BIN_EXE_kqode"))
        .arg(BACKEND_MODE_ARG)
        .current_dir(cwd)
        .env("HOME", home)
        .env("USERPROFILE", home)
        // The isolated home keeps provider credentials unavailable so integration
        // tests are deterministic and never issue a live provider call.
        // Disable debug logging so the test-spawned backend never writes under
        // the real `~/.kqode/logs` (the dev build defaults it on).
        .env("KQODE_DEBUG", "0")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("backend process starts");

    child
        .stdin
        .as_mut()
        .expect("stdin is piped")
        .write_all(input)
        .expect("request is written");
    drop(child.stdin.take());

    child.wait_with_output().expect("backend exits")
}

pub fn request_frame(id: i64, method: &str, params: Value) -> Vec<u8> {
    let body = json!({
        "jsonrpc": "2.0",
        "id": id,
        "method": method,
        "params": params,
    })
    .to_string();

    format!("Content-Length: {}\r\n\r\n{body}", body.len()).into_bytes()
}

pub fn parse_stdout_frames(stdout: &[u8]) -> Vec<Value> {
    let mut frames = Vec::new();
    let mut offset = 0;

    while offset < stdout.len() {
        let relative_header_end = stdout[offset..]
            .windows(4)
            .position(|window| window == b"\r\n\r\n")
            .expect("frame header terminator exists");
        let header_end = offset + relative_header_end;
        let headers = std::str::from_utf8(&stdout[offset..header_end]).expect("headers are utf8");
        let content_length = headers
            .lines()
            .find_map(|line| line.strip_prefix("Content-Length: "))
            .expect("content length header exists")
            .parse::<usize>()
            .expect("content length is numeric");

        let body_start = header_end + 4;
        let body_end = body_start + content_length;
        frames.push(serde_json::from_slice(&stdout[body_start..body_end]).expect("valid json"));
        offset = body_end;
    }

    frames
}

/// Consumes the backend's leading ready notification and returns the response
/// frames that follow.
///
/// Every backend run now emits a one-shot [`BACKEND_READY_METHOD`] notification
/// before it handles requests, so response-oriented tests skip that first frame
/// while still asserting it was announced correctly.
#[allow(dead_code)]
pub fn response_frames(stdout: &[u8]) -> Vec<Value> {
    let mut frames = parse_stdout_frames(stdout);
    assert!(
        !frames.is_empty(),
        "backend must emit a ready notification before any response"
    );
    let ready = frames.remove(0);
    assert_eq!(
        ready["method"], BACKEND_READY_METHOD,
        "first stdout frame must be the ready notification: {ready}"
    );
    assert!(
        ready.get("id").is_none(),
        "ready is a notification and must not carry an id: {ready}"
    );
    frames
}
