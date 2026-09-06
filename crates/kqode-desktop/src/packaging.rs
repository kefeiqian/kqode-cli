use std::ffi::OsStr;

const COPILOT_SDK_DIAGNOSTIC: &str = "--verify-copilot-sdk-bundle";
const COPILOT_SDK_AUTH_DIAGNOSTIC: &str = "--verify-copilot-sdk-auth";

/// Runs release-package diagnostics instead of starting the desktop UI.
pub(crate) fn run_requested_diagnostic() {
    let arguments = std::env::args_os().skip(1).collect::<Vec<_>>();
    let verify_bundle = arguments
        .iter()
        .any(|argument| argument == OsStr::new(COPILOT_SDK_DIAGNOSTIC));
    let verify_auth = arguments
        .iter()
        .any(|argument| argument == OsStr::new(COPILOT_SDK_AUTH_DIAGNOSTIC));
    if !verify_bundle && !verify_auth {
        return;
    }

    let result =
        tauri::async_runtime::block_on(kqode_provider::verify_packaged_runtime(verify_auth));
    match result {
        Ok(()) => std::process::exit(0),
        Err(error) => {
            eprintln!("Copilot SDK package verification failed: {error}");
            std::process::exit(1);
        }
    }
}
