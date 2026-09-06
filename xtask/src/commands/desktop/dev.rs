use std::path::Path;

use crate::support::desktop;

pub fn run(repo_root: &Path) -> Result<(), String> {
    desktop::dev(repo_root)
}
