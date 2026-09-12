use std::{
    fs::{File, Metadata},
    io,
    path::{Component, Path, PathBuf},
};

use super::super::{SnapshotError, budget::Budget};
use super::{entry, handles, inspection_handles};

/// A source object retained for final observable-change checks.
pub(super) struct Pinned {
    pub path: PathBuf,
    pub file: File,
    pub metadata: Metadata,
}

impl Pinned {
    /// Rejects unsafe entries before their data can participate in a source check.
    pub fn new(file: File, path: &Path) -> Result<Self, SnapshotError> {
        let metadata = entry::inspect(&file, path)?;
        if metadata.is_file() {
            inspection_handles::single_link(&file, path)?;
        } else if !metadata.is_dir() {
            return Err(entry::unsupported(path, "not a regular file or directory"));
        }
        Ok(Self {
            path: path.to_owned(),
            file,
            metadata,
        })
    }

    /// Rechecks the same opened object without resolving the path again.
    pub fn validate(&self) -> Result<(), SnapshotError> {
        let after = entry::inspect(&self.file, &self.path)?;
        if after.is_file() {
            inspection_handles::single_link(&self.file, &self.path)?;
        }
        if !entry::unchanged(&self.metadata, &after) {
            return Err(SnapshotError::SourceChanged(self.path.clone()));
        }
        Ok(())
    }
}

/// Resolution distinguishes genuine absence from changed namespace structure.
pub(super) enum Location {
    Missing(PathBuf),
    Found,
    AncestorChanged,
    PathChanged,
}

/// Carries all opened ancestors even when resolution ends in a conflict.
pub(super) struct Lookup {
    pub location: Location,
    pub pins: Vec<Pinned>,
}

/// Resolves each component beneath a verified root, retaining every opened ancestor.
pub(super) fn locate(
    root: &File,
    source: &Path,
    path: &Path,
    budget: &mut Budget<'_>,
) -> Result<Lookup, SnapshotError> {
    let mut lookup = Lookup {
        location: Location::Found,
        pins: Vec::new(),
    };
    let mut relative = PathBuf::new();
    let mut components = path.components().peekable();
    while let Some(component) = components.next() {
        budget.entry()?;
        let Component::Normal(name) = component else {
            return Err(entry::unsupported(
                path,
                "source target must be relative normal components",
            ));
        };
        relative.push(name);
        let parent = lookup.pins.last().map_or(root, |pin| &pin.file);
        let file = match handles::source_child(parent, name) {
            Ok(file) => file,
            Err(error) if error.kind() == io::ErrorKind::NotFound => {
                lookup.location = Location::Missing(relative);
                return Ok(lookup);
            }
            Err(error) => return Err(SnapshotError::io("open source conflict target", error)),
        };
        let pin = Pinned::new(file, &relative)?;
        let canonical = handles::final_path(&pin.file)
            .map_err(|error| SnapshotError::io("verify source conflict path", error))?;
        let wrong_path = canonical != source.join(&relative);
        let wrong_ancestor = components.peek().is_some() && !pin.metadata.is_dir();
        if pin.metadata.is_dir() && relative.components().count() > budget.limits.max_depth {
            return Err(SnapshotError::LimitExceeded("max_depth"));
        }
        lookup.pins.push(pin);
        if wrong_path || wrong_ancestor {
            lookup.location = if wrong_path {
                Location::PathChanged
            } else {
                Location::AncestorChanged
            };
            return Ok(lookup);
        }
    }
    Ok(lookup)
}
