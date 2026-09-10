use std::{ffi::OsString, io, os::windows::ffi::OsStringExt};

/// Parses bounded native directory/stream records without borrowing unaligned structs.
pub(super) fn names(
    buffer: &[u8],
    name_offset: usize,
    length_offset: usize,
) -> io::Result<Vec<OsString>> {
    let mut offset = 0;
    let mut result = Vec::new();
    loop {
        let next = number(buffer, offset)? as usize;
        let length = number(buffer, offset + length_offset)? as usize;
        if length == 0 || !length.is_multiple_of(2) {
            return Err(io::Error::other("invalid native filename length"));
        }
        let start = offset
            .checked_add(name_offset)
            .ok_or_else(|| io::Error::other("native record overflow"))?;
        let end = start
            .checked_add(length)
            .ok_or_else(|| io::Error::other("native name overflow"))?;
        let bytes = buffer
            .get(start..end)
            .ok_or_else(|| io::Error::other("truncated native name"))?;
        let units: Vec<u16> = bytes
            .chunks_exact(2)
            .map(|chunk| u16::from_le_bytes([chunk[0], chunk[1]]))
            .collect();
        result.push(OsString::from_wide(&units));
        if next == 0 {
            break;
        }
        if next < name_offset + length {
            return Err(io::Error::other("overlapping native records"));
        }
        offset = offset
            .checked_add(next)
            .ok_or_else(|| io::Error::other("native record overflow"))?;
    }
    Ok(result)
}

fn number(buffer: &[u8], offset: usize) -> io::Result<u32> {
    let bytes = buffer
        .get(offset..offset.saturating_add(4))
        .ok_or_else(|| io::Error::other("truncated native record"))?;
    Ok(u32::from_le_bytes(
        bytes.try_into().map_err(io::Error::other)?,
    ))
}
