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
            .map(|name| environment_key(OsStr::new(name)))
            .collect();
        Self { inherited_names }
    }
}

impl EnvironmentPolicy {
    pub(super) fn build(
        &self,
        overrides: &BTreeMap<String, String>,
    ) -> BTreeMap<OsString, OsString> {
        self.build_from(std::env::vars_os(), overrides)
    }

    fn build_from(
        &self,
        inherited: impl IntoIterator<Item = (OsString, OsString)>,
        overrides: &BTreeMap<String, String>,
    ) -> BTreeMap<OsString, OsString> {
        let mut environment = inherited
            .into_iter()
            .map(|(name, value)| (environment_key(&name), value))
            .filter(|(name, _)| self.inherited_names.contains(name))
            .filter(|(name, _)| !is_secret_name(name))
            .collect::<BTreeMap<_, _>>();
        for (name, value) in overrides {
            if !is_secret_name(OsStr::new(name)) {
                environment.insert(environment_key(OsStr::new(name)), OsString::from(value));
            }
        }
        environment
    }
}

fn environment_key(name: &OsStr) -> OsString {
    #[cfg(windows)]
    {
        use std::os::windows::ffi::{OsStrExt, OsStringExt};
        let units: Vec<u16> = name
            .encode_wide()
            .map(|unit| {
                if (u16::from(b'a')..=u16::from(b'z')).contains(&unit) {
                    unit - u16::from(b'a' - b'A')
                } else {
                    unit
                }
            })
            .collect();
        OsString::from_wide(&units)
    }
    #[cfg(not(windows))]
    {
        name.to_owned()
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn inherited_allowlist_and_secret_filter_remain_closed() {
        let output = EnvironmentPolicy::default().build_from(
            [("PATH", "tools"), ("UNLISTED", "omit"), ("API_KEY", "omit")]
                .map(|(name, value)| (name.into(), value.into())),
            &BTreeMap::from([("OTHER_SECRET".to_owned(), "omit".to_owned())]),
        );
        assert_eq!(output, BTreeMap::from([("PATH".into(), "tools".into())]));
    }

    #[cfg(windows)]
    #[test]
    fn windows_environment_names_are_case_insensitive() {
        let output = EnvironmentPolicy::default().build_from(
            [
                ("Path", "old"),
                ("SYSTEMROOT", r"C:\Windows"),
                ("windir", r"C:\Windows"),
            ]
            .map(|(name, value)| (name.into(), value.into())),
            &BTreeMap::from([("path".to_owned(), "new".to_owned())]),
        );
        assert_eq!(output.len(), 3);
        assert_eq!(output.get(OsStr::new("PATH")).unwrap(), "new");
        assert_eq!(output.get(OsStr::new("SYSTEMROOT")).unwrap(), r"C:\Windows");
        assert!(output.contains_key(OsStr::new("WINDIR")));
    }

    #[cfg(not(windows))]
    #[test]
    fn unix_environment_names_remain_case_sensitive() {
        let output = EnvironmentPolicy::default().build_from(
            [("Path", "omit"), ("PATH", "tools")].map(|(name, value)| (name.into(), value.into())),
            &BTreeMap::new(),
        );
        assert_eq!(output, BTreeMap::from([("PATH".into(), "tools".into())]));
    }
}
