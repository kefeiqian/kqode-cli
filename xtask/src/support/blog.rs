use std::path::Path;

use crate::support::{bun, paths};

/// Installs the Docusaurus blog dependencies with Bun.
///
/// # Errors
///
/// Returns an error when Bun cannot be started or dependency installation fails.
pub fn install(repo_root: &Path) -> Result<(), String> {
    bun::run_in(&paths::blog_root(repo_root), &["install"])
}

/// Builds the Docusaurus blog static output.
///
/// # Errors
///
/// Returns an error when dependencies cannot be installed or the build fails.
pub fn build(repo_root: &Path) -> Result<(), String> {
    ensure_dependencies(repo_root)?;
    bun::run_in(&paths::blog_root(repo_root), &["run", "build"])
}

/// Runs the Docusaurus blog TypeScript typecheck.
///
/// # Errors
///
/// Returns an error when dependencies cannot be installed or typechecking fails.
pub fn typecheck(repo_root: &Path) -> Result<(), String> {
    ensure_dependencies(repo_root)?;
    bun::run_in(&paths::blog_root(repo_root), &["run", "typecheck"])
}

/// Starts the Docusaurus blog dev server with hot reload.
///
/// # Errors
///
/// Returns an error when dependencies cannot be installed or the dev server fails.
pub fn serve(repo_root: &Path) -> Result<(), String> {
    ensure_dependencies(repo_root)?;
    bun::run_in(&paths::blog_root(repo_root), &["run", "serve"])
}

/// Starts the English Docusaurus blog dev server with hot reload.
///
/// # Errors
///
/// Returns an error when dependencies cannot be installed or the dev server fails.
pub fn serve_en(repo_root: &Path) -> Result<(), String> {
    ensure_dependencies(repo_root)?;
    bun::run_in(&paths::blog_root(repo_root), &["run", "serve:en"])
}

/// Serves a production build of the Docusaurus blog locally.
///
/// # Errors
///
/// Returns an error when dependencies cannot be installed or static preview fails.
pub fn preview(repo_root: &Path) -> Result<(), String> {
    ensure_dependencies(repo_root)?;
    bun::run_in(&paths::blog_root(repo_root), &["run", "preview"])
}

fn ensure_dependencies(repo_root: &Path) -> Result<(), String> {
    let docusaurus = paths::blog_bin(repo_root, "docusaurus");

    if docusaurus.is_file() {
        Ok(())
    } else {
        println!("Blog dependencies are missing; running bun install.");
        install(repo_root)
    }
}
