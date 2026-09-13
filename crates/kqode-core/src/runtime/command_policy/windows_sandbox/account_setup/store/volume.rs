use super::super::private_acl::invalid;
use std::{
    ffi::OsStr,
    fs::{File, OpenOptions},
    io,
    os::windows::{ffi::OsStrExt, fs::OpenOptionsExt},
};
use windows_sys::Win32::Storage::FileSystem::{
    FILE_FLAG_BACKUP_SEMANTICS, FILE_FLAG_OPEN_REPARSE_POINT, FILE_SHARE_READ, FILE_SHARE_WRITE,
    QueryDosDeviceW,
};

const MAX_DEVICE_UNITS: usize = 32768;
const LOCAL_VOLUME_PREFIX: &str = r"\Device\HarddiskVolume";

/// Rejects remote and SUBST device mappings before opening their filesystem namespace.
pub(super) fn open(root: &OsStr) -> io::Result<File> {
    let units: Vec<_> = root.encode_wide().collect();
    if units.len() != 7
        || units[..4] != [b'\\' as u16, b'\\' as u16, b'?' as u16, b'\\' as u16]
        || units[5..] != [b':' as u16, b'\\' as u16]
    {
        return Err(invalid("invalid local drive root"));
    }
    let drive = [units[4], b':' as u16, 0];
    let mut buffer = vec![0u16; MAX_DEVICE_UNITS];
    let count =
        unsafe { QueryDosDeviceW(drive.as_ptr(), buffer.as_mut_ptr(), buffer.len() as u32) };
    if count == 0 {
        return Err(io::Error::last_os_error());
    }
    let target = buffer
        .get(..count as usize)
        .ok_or_else(|| invalid("invalid DOS device query length"))?
        .split(|unit| *unit == 0)
        .next()
        .ok_or_else(|| invalid("missing DOS device target"))?;
    if !local_target(target) {
        return Err(invalid(
            "known-folder drive is not a direct local hard-disk volume",
        ));
    }
    OpenOptions::new()
        .read(true)
        .share_mode(FILE_SHARE_READ | FILE_SHARE_WRITE)
        .custom_flags(FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT)
        .open(root)
}

fn local_target(target: &[u16]) -> bool {
    let prefix: Vec<_> = LOCAL_VOLUME_PREFIX.encode_utf16().collect();
    target
        .strip_prefix(prefix.as_slice())
        .is_some_and(|suffix| {
            !suffix.is_empty()
                && suffix
                    .iter()
                    .all(|unit| (b'0' as u16..=b'9' as u16).contains(unit))
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_direct_local_disk_targets_are_accepted() {
        for target in [r"\Device\HarddiskVolume1", r"\Device\HarddiskVolume123"] {
            assert!(local_target(&target.encode_utf16().collect::<Vec<_>>()));
        }
        for target in [
            r"\??\C:\folder",
            r"\Device\Mup\server\share",
            r"\Device\LanmanRedirector\server",
            r"\Device\HarddiskVolume1\folder",
            r"\Device\HarddiskVolume",
        ] {
            assert!(!local_target(&target.encode_utf16().collect::<Vec<_>>()));
        }
    }
}
