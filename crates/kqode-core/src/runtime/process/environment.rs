use std::{
    collections::{BTreeMap, BTreeSet},
    ffi::{OsStr, OsString},
};

const COMMON_INHERITED_VARIABLES: &[&str] = &[
    "HOME", "LANG", "LC_ALL", "LC_CTYPE", "PATH", "TEMP", "TERM", "TMP", "TMPDIR",
];

#[cfg(windows)]
const PLATFORM_INHERITED_VARIABLES: &[&str] = &[
    "APPDATA",
    "COMSPEC",
    "HOMEDRIVE",
    "HOMEPATH",
    "LOCALAPPDATA",
    "PATHEXT",
    "ProgramData",
    "ProgramFiles",
    "ProgramFiles(x86)",
    "ProgramW6432",
    "SystemRoot",
    "USERNAME",
    "USERPROFILE",
    "WINDIR",
];

#[cfg(not(windows))]
const PLATFORM_INHERITED_VARIABLES: &[&str] = &[];

/// Constructs a conservative child environment from explicit inherited names.
#[derive(Clone, Debug)]
pub struct EnvironmentPolicy {
    inherited_names: BTreeSet<OsString>,
}

impl Default for EnvironmentPolicy {
    fn default() -> Self {
        let inherited_names = COMMON_INHERITED_VARIABLES
            .iter()
            .chain(PLATFORM_INHERITED_VARIABLES)
            .map(OsString::from)
            .collect();
        Self { inherited_names }
    }
}

impl EnvironmentPolicy {
    pub(super) fn build(
        &self,
        overrides: &BTreeMap<String, String>,
    ) -> BTreeMap<OsString, OsString> {
        let mut environment = std::env::vars_os()
            .filter(|(name, _)| self.inherited_names.contains(name))
            .filter(|(name, _)| !is_secret_name(name))
            .collect::<BTreeMap<_, _>>();
        for (name, value) in overrides {
            if !is_secret_name(OsStr::new(name)) {
                environment.insert(OsString::from(name), OsString::from(value));
            }
        }
        environment
    }
}

fn is_secret_name(name: &OsStr) -> bool {
    let normalized = name.to_string_lossy().to_ascii_uppercase();
    [
        "TOKEN",
        "SECRET",
        "PASSWORD",
        "CREDENTIAL",
        "API_KEY",
        "ACCESS_KEY",
        "PRIVATE_KEY",
        "COOKIE",
    ]
    .iter()
    .any(|marker| normalized.contains(marker))
}
