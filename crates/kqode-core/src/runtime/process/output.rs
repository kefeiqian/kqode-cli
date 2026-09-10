use std::collections::VecDeque;

use tokio::io::{AsyncRead, AsyncReadExt};

use super::ProcessError;

pub(super) struct CapturedOutput {
    pub text: String,
    pub omitted_bytes: usize,
}

pub(super) async fn read_bounded(
    mut reader: impl AsyncRead + Unpin,
    limit: usize,
) -> Result<CapturedOutput, ProcessError> {
    let head_limit = limit / 2;
    let tail_limit = limit - head_limit;
    let mut head = Vec::with_capacity(head_limit);
    let mut tail = VecDeque::with_capacity(tail_limit);
    let mut total = 0usize;
    let mut buffer = [0_u8; 8192];

    loop {
        let read = reader
            .read(&mut buffer)
            .await
            .map_err(ProcessError::Supervision)?;
        if read == 0 {
            break;
        }
        total = total.saturating_add(read);
        let mut chunk = &buffer[..read];
        if head.len() < head_limit {
            let retained = (head_limit - head.len()).min(chunk.len());
            head.extend_from_slice(&chunk[..retained]);
            chunk = &chunk[retained..];
        }
        for byte in chunk {
            if tail.len() == tail_limit && tail_limit > 0 {
                tail.pop_front();
            }
            if tail_limit > 0 {
                tail.push_back(*byte);
            }
        }
    }

    let mut retained = head;
    retained.extend(tail);
    let omitted_bytes = total.saturating_sub(retained.len());
    Ok(CapturedOutput {
        text: String::from_utf8_lossy(&retained).into_owned(),
        omitted_bytes,
    })
}
