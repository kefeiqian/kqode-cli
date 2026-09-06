use std::path::{Path, PathBuf};

const BLOG_ROOT: &str = "blog";
const DESKTOP_FRONTEND_ROOT: &str = "crates/kqode-desktop/frontend";

pub fn repo_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("xtask manifest should live under the repository root")
        .to_path_buf()
}

pub fn blog_root(repo_root: &Path) -> PathBuf {
    repo_root.join(BLOG_ROOT)
}

pub fn desktop_frontend_root(repo_root: &Path) -> PathBuf {
    repo_root.join(DESKTOP_FRONTEND_ROOT)
}

pub fn blog_bin(repo_root: &Path, name: &str) -> PathBuf {
    package_bin(&blog_root(repo_root), name)
}

pub fn desktop_bin(repo_root: &Path, name: &str) -> PathBuf {
    package_bin(&desktop_frontend_root(repo_root), name)
}

fn package_bin(package_root: &Path, name: &str) -> PathBuf {
    let binary_name = if cfg!(windows) {
        format!("{name}.exe")
    } else {
        name.to_string()
    };

    package_root
        .join("node_modules")
        .join(".bin")
        .join(binary_name)
}
