use std::path::{Path, PathBuf};

const TUI_PACKAGE_ROOT: &str = "tui";
const BLOG_ROOT: &str = "blog";

pub fn repo_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("xtask manifest should live under the repository root")
        .to_path_buf()
}

pub fn fixture_sources_root(repo_root: &Path) -> PathBuf {
    repo_root
        .join("target")
        .join("kqode-test-workspaces")
        .join(".fixture-sources")
}

pub fn workspace(repo_root: &Path) -> PathBuf {
    repo_root
        .join("target")
        .join("kqode-test-workspaces")
        .join("workspace")
}

pub fn tui_package_root(repo_root: &Path) -> PathBuf {
    repo_root.join(TUI_PACKAGE_ROOT)
}

pub fn blog_root(repo_root: &Path) -> PathBuf {
    repo_root.join(BLOG_ROOT)
}

pub fn tui_entrypoint(repo_root: &Path) -> PathBuf {
    tui_package_root(repo_root).join("main.tsx")
}

/// Path to the packaged standalone executable produced by `cargo xtask package`.
pub fn tui_packaged_exe(repo_root: &Path) -> PathBuf {
    let name = if cfg!(windows) { "kqode.exe" } else { "kqode" };
    tui_package_root(repo_root).join("dist").join(name)
}

pub fn tui_tsconfig(repo_root: &Path) -> PathBuf {
    tui_package_root(repo_root).join("tsconfig.json")
}

pub fn tui_bin(repo_root: &Path, name: &str) -> PathBuf {
    package_bin(&tui_package_root(repo_root), name)
}

pub fn blog_bin(repo_root: &Path, name: &str) -> PathBuf {
    package_bin(&blog_root(repo_root), name)
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
