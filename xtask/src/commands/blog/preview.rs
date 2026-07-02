use std::path::Path;

use crate::support::blog;

pub fn run(repo_root: &Path) -> Result<(), String> {
    blog::preview(repo_root)
}
