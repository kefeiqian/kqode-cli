use super::{
    super::{SandboxAccountSetupError as Error, file_journal, guard::Guard, native, private_acl},
    checked,
};
use crate::runtime::{
    windows_file::{open_child, volume_path},
    windows_security::current_user_sid,
};
use std::{
    ffi::OsString,
    fs::File,
    io,
    os::windows::{
        ffi::{OsStrExt, OsStringExt},
        fs::MetadataExt,
    },
    path::Path,
};
use windows_sys::Win32::Storage::FileSystem::{
    FILE_ATTRIBUTE_REPARSE_POINT, FILE_SHARE_READ, FILE_SHARE_WRITE,
};

pub(super) const MAX_COMPONENTS: usize = 64;

/// Keeps every ancestor open without delete sharing for the entire store lifetime.
pub(super) struct Anchor {
    handles: Vec<File>,
    installer: String,
    pub user: String,
}

impl Anchor {
    pub fn open(path: &Path, guard: &Guard<'_>) -> Result<Self, Error> {
        guard.check()?;
        checked(
            "validate process identity",
            file_journal::require_process_identity(),
        )?;
        let (root, names) = checked("parse known folder", components(path))?;
        let installer = native::trusted_installer()?;
        let user = checked("read owner identity", current_user_sid())?;
        let root = checked("open local volume root", super::volume::open(&root))?;
        checked(
            "validate local volume",
            file_journal::validate_parent(&root),
        )?;
        if checked("resolve volume root", volume_path(&root))?
            .components()
            .count()
            != 2
        {
            return Err(Error::InvalidNativeData(
                "known-folder drive is not a volume root",
            ));
        }
        let mut anchor = Self {
            handles: vec![root],
            installer,
            user,
        };
        for name in names {
            guard.check()?;
            anchor.verify_last()?;
            let child = checked(
                "open known-folder component",
                open_child(
                    anchor.parent(),
                    &name,
                    None,
                    FILE_SHARE_READ | FILE_SHARE_WRITE,
                    None,
                    true,
                ),
            )?;
            anchor.handles.push(child);
        }
        anchor.verify(guard)?;
        Ok(anchor)
    }

    pub fn parent(&self) -> &File {
        &self.handles[self.handles.len() - 1]
    }

    pub fn verify(&self, guard: &Guard<'_>) -> Result<(), Error> {
        checked(
            "validate process identity",
            file_journal::require_process_identity(),
        )?;
        if checked("read owner identity", current_user_sid())? != self.user {
            return Err(Error::InvalidNativeData("storage identity changed"));
        }
        for file in &self.handles {
            guard.check()?;
            checked(
                "validate storage ancestor",
                verify_directory(file, &self.installer),
            )?;
        }
        guard.check()
    }

    fn verify_last(&self) -> Result<(), Error> {
        checked(
            "validate storage ancestor",
            verify_directory(self.parent(), &self.installer),
        )
    }
}

fn verify_directory(file: &File, installer: &str) -> io::Result<()> {
    let metadata = file.metadata()?;
    if !metadata.is_dir() || metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0 {
        return Err(private_acl::invalid(
            "storage ancestor is not a non-reparse directory",
        ));
    }
    private_acl::verify_ancestor(file, installer)
}

/// Only explicit drive-rooted, literal components are accepted; no UNC/device/dot normalization.
pub(super) fn components(path: &Path) -> io::Result<(OsString, Vec<OsString>)> {
    let units: Vec<_> = path.as_os_str().encode_wide().collect();
    if units.len() < 4
        || !((b'A' as u16..=b'Z' as u16).contains(&units[0])
            || (b'a' as u16..=b'z' as u16).contains(&units[0]))
        || units[1..3] != [b':' as u16, b'\\' as u16]
    {
        return Err(private_acl::invalid(
            "known folder must be an absolute local drive path",
        ));
    }
    let mut names = Vec::new();
    for part in units[3..].split(|unit| *unit == b'\\' as u16) {
        if part.is_empty()
            || part == [b'.' as u16]
            || part == [b'.' as u16, b'.' as u16]
            || part
                .iter()
                .any(|unit| [0, b':' as u16, b'/' as u16].contains(unit))
            || part
                .last()
                .is_some_and(|unit| [b'.' as u16, b' ' as u16].contains(unit))
        {
            return Err(private_acl::invalid(
                "invalid literal known-folder component",
            ));
        }
        names.push(OsString::from_wide(part));
        if names.len() > MAX_COMPONENTS {
            return Err(private_acl::invalid("known-folder depth exceeds its limit"));
        }
    }
    let root = OsString::from(format!(
        r"\\?\{}:\",
        char::from_u32(u32::from(units[0])).unwrap()
    ));
    Ok((root, names))
}
