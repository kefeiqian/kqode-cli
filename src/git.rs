//! Git and GitHub status for the current workspace.
//!
//! The backend runs in the workspace directory (the TUI spawns it with
//! `cwd = workspaceCwd`), so git/GitHub commands are invoked in the inherited
//! process cwd — no path argument is threaded through the protocol. Parsing and
//! label formatting live here in the core runtime so the headless CLI and the
//! TUI stay consistent.

mod command;
mod status;

pub use status::{PullRequestStatus, pull_request, status_label};
