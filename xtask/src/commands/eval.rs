use std::path::Path;

use crate::{commands::CommandSpec, support::cargo};

/// Cargo bin target that implements the eval runner.
const EVAL_BIN: &str = "kqode";

pub const COMMAND: CommandSpec = CommandSpec {
    name: "eval",
    description: "Run public no-tool benchmarks (usage: eval <selection> [--limit N] [--out DIR])",
    run,
};

/// Runs the benchmark suite by forwarding to `kqode eval <args>`.
///
/// This is the thin Cargo-facing wrapper; the real runner lives in the `kqode`
/// binary's `eval` subcommand. Arguments after the command name are forwarded
/// verbatim — the xtask dispatcher consumes argument 1 as the command name, so
/// the eval arguments start at argument 2 (matching `set-version`).
///
/// # Errors
///
/// Returns an error when the `kqode` build fails or the eval run exits non-zero.
pub fn run(repo_root: &Path) -> Result<(), String> {
    // The xtask command name (`eval`) is also the `kqode` subcommand token, so
    // reuse it rather than repeating a bare string literal.
    let mut args = vec![COMMAND.name.to_string()];
    args.extend(std::env::args().skip(2));
    cargo::run_bin(repo_root, EVAL_BIN, &args)
}
