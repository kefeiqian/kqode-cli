use std::path::Path;

use crate::support::blog;

pub fn run(repo_root: &Path) -> Result<(), String> {
    blog::serve_en(repo_root)
}
