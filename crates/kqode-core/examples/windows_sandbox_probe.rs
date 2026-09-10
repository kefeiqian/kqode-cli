//! Opt-in native isolation feasibility probe, not a production sandbox backend.
//!
//! Run with `cargo run -p kqode-core --example windows_sandbox_probe`.
//! Use `-- --snapshot-only` for the focused copy-isolation comparison.
//! Changes ACLs only on newly created temporary fixtures. Creates and removes a
//! uniquely named AppContainer profile. No accounts, firewall rules or loopback
//! exemptions are created. This probe runs only fixed, checked-in scripts.
//! The fixture deliberately mixes read/write grants and counterexamples; it does
//! not implement SandboxPermissions. CommandContext is used only for transport
//! and the frozen environment, never as an assertion that the probe is authorized.

#[cfg(windows)]
#[path = "windows_sandbox_probe/probe.rs"]
mod probe;

#[cfg(windows)]
fn main() -> Result<(), Box<dyn std::error::Error>> {
    probe::run()
}

#[cfg(not(windows))]
fn main() {
    eprintln!("windows_sandbox_probe requires native Windows");
    std::process::exit(1);
}
