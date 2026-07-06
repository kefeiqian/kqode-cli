use crate::protocol::ModelInfoWire;
use crate::provider::ModelInfo;

pub(super) fn sanitize_model(model: ModelInfo) -> ModelInfoWire {
    ModelInfoWire {
        id: sanitize_model_id(&model.id),
        // `owned_by` is display-bound metadata too, so it must be scrubbed on
        // the same boundary as `id` (a hostile catalog could hide escapes here).
        owned_by: model.owned_by.as_deref().map(sanitize_model_id),
    }
}

pub(super) fn sanitize_model_id(input: &str) -> String {
    let mut output = String::with_capacity(input.len());
    let bytes = input.as_bytes();
    let mut index = 0;
    while index < bytes.len() {
        match bytes[index] {
            0x1b => index = skip_escape(bytes, index + 1),
            byte if is_control(byte) => index += 1,
            _ => {
                let ch = input[index..].chars().next().expect("valid char boundary");
                if !ch.is_control() {
                    output.push(ch);
                }
                index += ch.len_utf8();
            }
        }
    }
    output
}

fn skip_escape(bytes: &[u8], mut index: usize) -> usize {
    match bytes.get(index).copied() {
        Some(b']') => {
            index += 1;
            while index < bytes.len() {
                if bytes[index] == 0x07 {
                    return index + 1;
                }
                if bytes[index] == 0x1b && bytes.get(index + 1) == Some(&b'\\') {
                    return index + 2;
                }
                index += 1;
            }
            index
        }
        Some(b'[') => {
            index += 1;
            while index < bytes.len() {
                if (0x40..=0x7e).contains(&bytes[index]) {
                    return index + 1;
                }
                index += 1;
            }
            index
        }
        _ => index,
    }
}

fn is_control(byte: u8) -> bool {
    byte <= 0x1f || (0x7f..=0x9f).contains(&byte)
}
