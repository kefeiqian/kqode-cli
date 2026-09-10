use std::{ffi::OsStr, io, os::windows::ffi::OsStrExt};

use super::CommandContext;
use super::native::wide;

/// Conventional local path spelling supported by this first native runner.
/// Reject unusual names rather than changing verbatim-path semantics.
pub(super) fn conventional_path(path: &OsStr) -> io::Result<Vec<u16>> {
    let text = path
        .to_str()
        .ok_or_else(|| io::Error::other("probe needs Unicode paths"))?;
    let text = text.strip_prefix(r"\\?\").unwrap_or(text);
    if text.starts_with("UNC\\") || text.split('\\').any(|part| part.ends_with([' ', '.'])) {
        return Err(io::Error::other(
            "probe requires ordinary local drive paths",
        ));
    }
    let units = wide(text)?;
    if units.len() >= 260 || units.contains(&u16::from(b'"')) {
        return Err(io::Error::other("unsupported probe path length or quote"));
    }
    Ok(units)
}

pub(super) fn command_line(context: &CommandContext) -> io::Result<Vec<u16>> {
    let mut command = vec![u16::from(b'"')];
    let mut program = conventional_path(context.program())?;
    program.pop();
    command.extend(program);
    command.push(u16::from(b'"'));
    // Only the fixed switches and base64 produced by the PowerShell adapter.
    for argument in context.arguments() {
        let units: Vec<u16> = argument.encode_wide().collect();
        if units.is_empty()
            || units
                .iter()
                .any(|&unit| !matches!(unit, 43 | 45 | 47 | 48..=57 | 61 | 65..=90 | 97..=122))
        {
            return Err(io::Error::other(
                "unexpected argument in fixed PowerShell transport",
            ));
        }
        command.push(u16::from(b' '));
        command.extend(units);
    }
    command.push(0);
    Ok(command)
}

pub(super) fn environment_block(context: &CommandContext) -> io::Result<Vec<u16>> {
    let mut block = Vec::new();
    for (name, value) in context.environment() {
        block.extend(name.encode_wide());
        block.push(u16::from(b'='));
        block.extend(wide(value)?);
    }
    if block.is_empty() {
        block.push(0);
    }
    block.push(0);
    Ok(block)
}
