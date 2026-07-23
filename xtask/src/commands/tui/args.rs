use std::{env, ffi::OsString, path::Path};

use crate::support::paths;

/// Returns arguments after the xtask command name, preserving them for the TUI CLI.
pub(crate) fn forwarded_tui_args() -> impl Iterator<Item = OsString> {
    env::args_os().skip(2)
}

/// Builds the `tsx` argument list for source-mode TUI launches.
pub(crate) fn source_tui_args(
    repo_root: &Path,
    forwarded_args: impl IntoIterator<Item = OsString>,
) -> Vec<OsString> {
    let mut args = vec![
        OsString::from("--tsconfig"),
        paths::tui_tsconfig(repo_root).into_os_string(),
        paths::tui_entrypoint(repo_root).into_os_string(),
    ];
    args.extend(forwarded_args);
    args
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::{Path, PathBuf};

    #[test]
    fn source_tui_args_appends_forwarded_args_after_entrypoint() {
        let repo_root = Path::new("/repo");
        let args = source_tui_args(
            repo_root,
            [
                OsString::from("--resume=019f5a2b-15e0-7ef1-9ad2-10a132448b7"),
                OsString::from("--debug"),
            ],
        );

        assert_eq!(args[0], OsString::from("--tsconfig"));
        assert_eq!(
            PathBuf::from(args[1].clone()),
            repo_root.join("tui").join("tsconfig.json")
        );
        assert_eq!(
            PathBuf::from(args[2].clone()),
            repo_root.join("tui").join("main.tsx")
        );
        assert_eq!(
            args[3],
            OsString::from("--resume=019f5a2b-15e0-7ef1-9ad2-10a132448b7")
        );
        assert_eq!(args[4], OsString::from("--debug"));
    }
}
