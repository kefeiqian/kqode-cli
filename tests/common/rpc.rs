use std::{
    io::Write,
    process::{Command, Output, Stdio},
};

use kqode::protocol::BACKEND_MODE_ARG;
use serde_json::{Value, json};

pub fn backend_output(input: &[u8]) -> Output {
    let mut child = Command::new(env!("CARGO_BIN_EXE_kqode"))
        .arg(BACKEND_MODE_ARG)
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
