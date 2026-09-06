use crate::inference::ChatError;

#[derive(Debug, Eq, PartialEq)]
pub(in crate::provider) struct SseEvent {
    pub(in crate::provider) event: Option<String>,
    pub(in crate::provider) data: String,
}

#[derive(Default)]
pub(in crate::provider) struct SseDecoder {
    line: Vec<u8>,
    event: Option<String>,
    data: Vec<String>,
}

impl SseDecoder {
    pub(in crate::provider) fn push(&mut self, chunk: &[u8]) -> Result<Vec<SseEvent>, ChatError> {
        let mut events = Vec::new();
        for byte in chunk {
            if *byte == b'\n' {
                if let Some(event) = self.finish_line()? {
                    events.push(event);
                }
            } else {
                self.line.push(*byte);
            }
        }
        Ok(events)
    }

    pub(in crate::provider) fn finish(&mut self) -> Result<Vec<SseEvent>, ChatError> {
        let mut events = Vec::new();
        if !self.line.is_empty()
            && let Some(event) = self.finish_line()?
        {
            events.push(event);
        }
        if let Some(event) = self.finish_event() {
            events.push(event);
        }
        Ok(events)
    }

    fn finish_line(&mut self) -> Result<Option<SseEvent>, ChatError> {
        if self.line.last() == Some(&b'\r') {
            self.line.pop();
        }
        let line = String::from_utf8(std::mem::take(&mut self.line))
            .map_err(|error| ChatError::Response(format!("decode LLM stream: {error}")))?;
        if line.is_empty() {
            return Ok(self.finish_event());
        }
        if line.starts_with(':') {
            return Ok(None);
        }

        let (field, value) = line
            .split_once(':')
            .map_or((line.as_str(), ""), |(field, value)| {
                (field, value.strip_prefix(' ').unwrap_or(value))
            });
        match field {
            "event" => self.event = Some(value.to_owned()),
            "data" => self.data.push(value.to_owned()),
            _ => {}
        }
        Ok(None)
    }

    fn finish_event(&mut self) -> Option<SseEvent> {
        if self.event.is_none() && self.data.is_empty() {
            return None;
        }
        Some(SseEvent {
            event: self.event.take(),
            data: std::mem::take(&mut self.data).join("\n"),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::{SseDecoder, SseEvent};

    #[test]
    fn decodes_events_across_chunks() {
        let mut decoder = SseDecoder::default();
        assert!(decoder.push(b"event: message\nda").unwrap().is_empty());
        assert_eq!(
            decoder.push(b"ta: {\"text\":\"hello\"}\r\n\r\n").unwrap(),
            [SseEvent {
                event: Some("message".to_owned()),
                data: "{\"text\":\"hello\"}".to_owned(),
            }]
        );
    }
}
