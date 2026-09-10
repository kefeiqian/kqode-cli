use std::{
    collections::{BTreeMap, BTreeSet},
    ffi::{OsStr, OsString},
};

use super::CommandGateError;
use crate::runtime::{
    EnvironmentPolicy,
    process::{environment_key, is_secret_name},
};

pub(super) fn freeze(
    overrides: &BTreeMap<String, String>,
) -> Result<BTreeMap<OsString, OsString>, CommandGateError> {
    let mut names = BTreeSet::new();
    for (name, value) in overrides {
        let key = environment_key(OsStr::new(name));
        if name.is_empty()
            || name.contains(['=', '\0'])
            || value.contains('\0')
            || is_secret_name(OsStr::new(name))
            || !names.insert(key)
        {
            return Err(CommandGateError::InvalidEnvironment);
        }
    }
    Ok(EnvironmentPolicy::default().build(overrides))
}
