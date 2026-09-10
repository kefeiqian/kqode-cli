use std::{
    fs::{File, Metadata},
    io::{Read, Write},
    os::windows::fs::MetadataExt,
    path::Path,
    time::Instant,
};

use windows_sys::Win32::Storage::FileSystem::FILE_ATTRIBUTE_REPARSE_POINT;

use super::super::{SnapshotError, SnapshotLimits, SnapshotSummary};
use super::{directory, handles, names};
use crate::cancellation::CancellationToken;

const COPY_BUFFER_BYTES: usize = 64 * 1024;

pub(super) struct Walker<'a> {
    pub limits: SnapshotLimits,
    pub cancellation: &'a CancellationToken,
    pub deadline: Instant,
    pub entries: usize,
    pub summary: SnapshotSummary,
}

impl Walker<'_> {
    fn check(&self) -> Result<(), SnapshotError> {
        if self.cancellation.is_cancelled() {
            return Err(SnapshotError::Cancelled);
        }
        if Instant::now() >= self.deadline {
            return Err(SnapshotError::LimitExceeded("timeout"));
        }
        Ok(())
    }

    pub fn directory(
        &mut self,
        source: &File,
        destination: &File,
        relative: &Path,
        depth: usize,
    ) -> Result<(), SnapshotError> {
        self.check()?;
        let before = inspect(source, relative)?;
        if !before.is_dir() {
            return Err(unsupported(relative, "not a directory"));
        }
        if depth > self.limits.max_depth {
            return Err(SnapshotError::LimitExceeded("max_depth"));
        }
        directory::visit(source, |name| {
            self.check()?;
            if self.entries >= self.limits.max_entries {
                return Err(SnapshotError::LimitExceeded("max_entries"));
            }
            self.entries += 1;
            let child_path = relative.join(name);
            let text = name
                .to_str()
                .ok_or_else(|| unsupported(&child_path, "non-Unicode filename"))?;
            if text.eq_ignore_ascii_case(".git") {
                self.summary.excluded_git_paths.push(child_path);
                return Ok(());
            }
            if !names::ordinary(text) {
                return Err(unsupported(
                    &child_path,
                    "filename has special Win32 semantics",
                ));
            }
            let child = handles::child(source, name, None)
                .map_err(|error| SnapshotError::io("open source entry", error))?;
            let metadata = inspect(&child, &child_path)?;
            let mut output = handles::child(destination, name, Some(metadata.is_dir()))
                .map_err(|error| SnapshotError::io("create snapshot entry", error))?;
            if metadata.is_dir() {
                self.summary.directories += 1;
                self.directory(&child, &output, &child_path, depth + 1)
            } else if metadata.is_file() {
                self.copy_file(child, &mut output, &child_path, metadata)
            } else {
                Err(unsupported(&child_path, "not a regular file or directory"))
            }
        })?;
        unchanged(
            &before,
            &source
                .metadata()
                .map_err(|error| SnapshotError::io("recheck source directory", error))?,
            relative,
        )?;
        self.check()
    }

    fn copy_file(
        &mut self,
        mut source: File,
        output: &mut File,
        relative: &Path,
        before: Metadata,
    ) -> Result<(), SnapshotError> {
        if before.len() > self.limits.max_bytes - self.summary.bytes {
            return Err(SnapshotError::LimitExceeded("max_bytes"));
        }
        let mut buffer = [0u8; COPY_BUFFER_BYTES];
        let mut copied = 0u64;
        loop {
            self.check()?;
            let count = source
                .read(&mut buffer)
                .map_err(|error| SnapshotError::io("read source file", error))?;
            if count == 0 {
                break;
            }
            if count as u64 > self.limits.max_bytes - self.summary.bytes {
                return Err(SnapshotError::LimitExceeded("max_bytes"));
            }
            output
                .write_all(&buffer[..count])
                .map_err(|error| SnapshotError::io("write snapshot file", error))?;
            self.summary.bytes += count as u64;
            copied += count as u64;
        }
        if copied != before.len() {
            return Err(SnapshotError::SourceChanged(relative.to_owned()));
        }
        unchanged(
            &before,
            &source
                .metadata()
                .map_err(|error| SnapshotError::io("recheck source file", error))?,
            relative,
        )?;
        self.summary.files += 1;
        Ok(())
    }
}

fn inspect(file: &File, relative: &Path) -> Result<Metadata, SnapshotError> {
    let metadata = file
        .metadata()
        .map_err(|error| SnapshotError::io("inspect source entry", error))?;
    if metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0 {
        return Err(unsupported(relative, "reparse points are not followed"));
    }
    if directory::has_named_stream(file, metadata.is_dir())
        .map_err(|error| SnapshotError::io("inspect source streams", error))?
    {
        return Err(unsupported(
            relative,
            "named data streams are not supported",
        ));
    }
    Ok(metadata)
}

fn unchanged(before: &Metadata, after: &Metadata, path: &Path) -> Result<(), SnapshotError> {
    if before.len() != after.len() || before.last_write_time() != after.last_write_time() {
        return Err(SnapshotError::SourceChanged(path.to_owned()));
    }
    Ok(())
}

fn unsupported(path: &Path, reason: &'static str) -> SnapshotError {
    SnapshotError::UnsupportedEntry {
        path: path.to_owned(),
        reason,
    }
}
