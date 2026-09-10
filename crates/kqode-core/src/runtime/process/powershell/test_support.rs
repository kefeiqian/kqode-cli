use std::{fs, path::PathBuf, time::Duration};

pub(super) const TEST_TIMEOUT: Duration = Duration::from_secs(15);
pub(super) const OUTPUT_LIMIT: usize = 4096;

pub(super) struct Workspace(pub(super) PathBuf);

impl Workspace {
    pub(super) fn new() -> Self {
        let path = std::env::temp_dir().join(format!("kqode-powershell-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&path).unwrap();
        Self(path)
    }
}

impl Drop for Workspace {
    fn drop(&mut self) {
        fs::remove_dir_all(&self.0).unwrap();
    }
}
