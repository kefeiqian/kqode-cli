//! Bridges the `KQODE_ENV` build variable into the `__DEV__` / `__PROD__` compile
//! cfgs, giving the Rust core the same dev/prod deploy-target flags as the TUI
//! (`tui/src/globals.d.ts`). Test-harness detection uses the built-in `cfg(test)`,
//! so there is no `__TEST__` cfg.
//!
//! Resolving the environment here (at build time) rather than at runtime makes it
//! a compile-time constant, so `#[cfg(__PROD__)]` arms are conditionally compiled
//! and `cfg!(__PROD__)` branches are const-folded — the Rust analog of the TUI's
//! Bun `--define`. Keep the accepted values in sync with `src/build_env.rs`.

use std::env;

/// Build variable selecting the environment. Mirrors the TUI's `KQODE_ENV`.
const ENV_VAR: &str = "KQODE_ENV";

/// Accepted `KQODE_ENV` inputs (validated below).
const ALLOWED: [&str; 3] = ["dev", "test", "prod"];

/// Value used when `KQODE_ENV` is unset (plain `cargo build` / `cargo test`).
const DEFAULT: &str = "dev";

fn main() {
    // Register the custom deploy-target cfgs so rustc's `unexpected_cfgs` lint
    // (>=1.80) stays quiet. Test-harness detection uses the built-in `cfg(test)`,
    // which Cargo already knows, so it is not registered here.
    println!("cargo::rustc-check-cfg=cfg(__DEV__)");
    println!("cargo::rustc-check-cfg=cfg(__PROD__)");

    let env = env::var(ENV_VAR).unwrap_or_else(|_| DEFAULT.to_owned());
    assert!(
        ALLOWED.contains(&env.as_str()),
        "{ENV_VAR} must be one of {ALLOWED:?}, got {env:?}"
    );

    // `prod` is the only packaged deploy target; `dev`/`test` build a dev-style
    // binary (a `test` value still builds `__DEV__` — test-ness is `cfg(test)`).
    let cfg = if env == "prod" { "__PROD__" } else { "__DEV__" };
    println!("cargo::rustc-cfg={cfg}");
    // Env vars are not tracked by default; rebuild when this one changes.
    println!("cargo::rerun-if-env-changed={ENV_VAR}");
}
