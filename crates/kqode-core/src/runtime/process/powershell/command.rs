use std::{
    collections::BTreeMap,
    ffi::OsString,
    path::{Path, PathBuf},
    time::Duration,
};

use base64::{Engine, engine::general_purpose::STANDARD};

use super::{PowerShellError, discovery};
use crate::runtime::ProcessRequest;

// Nested UTF-16LE base64 transport expands each script unit to roughly 64/9 characters.
pub(super) const MAX_SCRIPT_UTF16_UNITS: usize = 4096;
pub(super) const UTF8_PREAMBLE: &str = "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)\n\
     $OutputEncoding = [Console]::OutputEncoding\n";
pub(super) const ARGUMENTS: &[&str] = &[
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
    "-OutputFormat",
    "Text",
    "-EncodedCommand",
];

/// A resolved native PowerShell executable, independent of approval and sandboxing.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PowerShell {
    executable: PathBuf,
}

impl PowerShell {
    /// Resolves an explicit host-configured executable or discovers PowerShell 7,
    /// then Windows PowerShell 5.1. Never delegates to cmd, Bash, or WSL.
    ///
    /// # Errors
    ///
    /// Rejects unsupported platforms, invalid explicit paths and discovery errors.
    /// An invalid explicit choice never silently falls back to another executable.
    pub fn resolve(explicit: Option<&Path>) -> Result<Self, PowerShellError> {
        Ok(Self {
            executable: discovery::resolve(explicit)?,
        })
    }

    /// Returns the canonical executable selected before request construction.
    pub fn executable(&self) -> &Path {
        &self.executable
    }

    /// Builds a closed-stdin process request for execution by `ProcessSupervisor`.
    ///
    /// The script is transported as UTF-16LE base64, not interpolated into a
    /// cmd/Bash wrapper. It retains PowerShell's exit semantics, including explicit
    /// `exit N`. Stdout and stderr use UTF-8 text. Before launch, callers must
    /// authorize the original script and final executable/cwd/environment, then
    /// apply the required sandbox. Encoding is transport, not approval.
    ///
    /// # Errors
    ///
    /// Rejects blank or oversized scripts without including script contents in errors.
    /// This does not authorize the request or make it sandboxed.
    pub fn prepare(
        &self,
        script: &str,
        timeout: Duration,
        max_output_bytes: usize,
    ) -> Result<ProcessRequest, PowerShellError> {
        let mut arguments: Vec<OsString> = ARGUMENTS.iter().map(OsString::from).collect();
        arguments.push(OsString::from(encode_script(script)?));
        Ok(ProcessRequest {
            program: self.executable.clone().into_os_string(),
            arguments,
            cwd: None,
            environment: BTreeMap::new(),
            timeout,
            max_output_bytes,
        })
    }
}

pub(super) fn encode_script(script: &str) -> Result<String, PowerShellError> {
    if script.trim().is_empty() {
        return Err(PowerShellError::EmptyCommand);
    }
    if script
        .encode_utf16()
        .take(MAX_SCRIPT_UTF16_UNITS + 1)
        .count()
        > MAX_SCRIPT_UTF16_UNITS
    {
        return Err(PowerShellError::CommandTooLong {
            max_utf16_units: MAX_SCRIPT_UTF16_UNITS,
        });
    }
    let payload = encode_utf16(script);
    // Parse the original script independently so leading `using`/`param` stays valid.
    let bootstrap = format!(
        "{UTF8_PREAMBLE}& ([scriptblock]::Create([System.Text.Encoding]::Unicode.GetString([System.Convert]::FromBase64String('{payload}'))))"
    );
    Ok(encode_utf16(&bootstrap))
}

fn encode_utf16(text: &str) -> String {
    let bytes: Vec<u8> = text.encode_utf16().flat_map(u16::to_le_bytes).collect();
    STANDARD.encode(bytes)
}
