use std::path::{Path, PathBuf};

use super::PowerShellError;

#[cfg(windows)]
const EXECUTABLE_NAMES: &[&str] = &["pwsh.exe", "powershell.exe"];

pub(super) fn resolve(explicit: Option<&Path>) -> Result<PathBuf, PowerShellError> {
    #[cfg(windows)]
    {
        if let Some(path) = explicit {
            return validate(path);
        }
        select(candidates())
    }
    #[cfg(not(windows))]
    {
        let _ = explicit;
        Err(PowerShellError::UnsupportedPlatform)
    }
}

#[cfg(windows)]
pub(super) fn candidates() -> Vec<PathBuf> {
    let mut paths = Vec::new();
    if let Some(program_files) = std::env::var_os("ProgramFiles") {
        paths.push(PathBuf::from(program_files).join(r"PowerShell\7\pwsh.exe"));
    }
    if let Some(path) = std::env::var_os("PATH") {
        paths.extend(
            std::env::split_paths(&path)
                .filter(|directory| directory.is_absolute())
                .map(|directory| directory.join("pwsh.exe")),
        );
    }
    if let Some(system_root) = std::env::var_os("SystemRoot") {
        paths.push(
            PathBuf::from(system_root).join(r"System32\WindowsPowerShell\v1.0\powershell.exe"),
        );
    }
    paths
}

#[cfg(windows)]
pub(super) fn select(paths: impl IntoIterator<Item = PathBuf>) -> Result<PathBuf, PowerShellError> {
    for path in paths {
        match validate(&path) {
            Ok(executable) => return Ok(executable),
            Err(PowerShellError::InspectExecutable { source, .. })
                if source.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(error),
        }
    }
    Err(PowerShellError::ExecutableNotFound)
}

#[cfg(windows)]
fn validate(path: &Path) -> Result<PathBuf, PowerShellError> {
    let supported_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| {
            EXECUTABLE_NAMES
                .iter()
                .any(|expected| name.eq_ignore_ascii_case(expected))
        });
    if !path.is_absolute() || !supported_name {
        return Err(PowerShellError::InvalidExecutablePath(path.to_owned()));
    }
    let executable = path
        .canonicalize()
        .map_err(|source| PowerShellError::InspectExecutable {
            path: path.to_owned(),
            source,
        })?;
    let metadata = executable
        .metadata()
        .map_err(|source| PowerShellError::InspectExecutable {
            path: path.to_owned(),
            source,
        })?;
    if !metadata.is_file() {
        return Err(PowerShellError::InvalidExecutablePath(path.to_owned()));
    }
    Ok(executable)
}
