use std::ffi::OsStr;

const COPILOT_SDK_BUNDLE_DIAGNOSTIC: &str = "--verify-copilot-sdk-bundle";

/// Runs release-package diagnostics instead of starting the desktop UI.
pub(crate) fn run_requested_diagnostic() {
    let verify_bundle = std::env::args_os()
        .skip(1)
        .any(|argument| argument == OsStr::new(COPILOT_SDK_BUNDLE_DIAGNOSTIC));
    if !verify_bundle {
        return;
    }

    let result = tauri::async_runtime::block_on(kqode_provider::verify_packaged_runtime());
    match result {
        Ok(()) => std::process::exit(0),
        Err(error) => {
            eprintln!("Copilot SDK package verification failed: {error}");
            std::process::exit(1);
        }
    }
}
