use std::{env, ffi::OsStr, process::ExitCode};

use kqode::{
    backend::BackendError,
    protocol::BACKEND_MODE_ARG,
    store::{STORE_FATAL_SENTINEL, StoreError},
};

/// Process exit code used when the backend cannot open or migrate the store.
const STORE_FAILURE_EXIT_CODE: u8 = 75;

fn main() -> ExitCode {
    match run() {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("{}", error.stderr_line());
            error.exit_code()
        }
    }
}

fn run() -> Result<(), CliError> {
    let mut args = env::args_os().skip(1);

    match args.next() {
        None => {
            println!("KQode starter CLI. Use `cargo xtask tui-dev` for the first Ink TUI.");
            Ok(())
        }
        Some(arg) if arg.as_os_str() == OsStr::new(BACKEND_MODE_ARG) => {
            if let Some(extra) = args.next() {
                return Err(CliError::Message(format!(
                    "{BACKEND_MODE_ARG} does not accept extra argument `{}`",
                    extra.to_string_lossy()
                )));
            }

            kqode::backend::run_stdio().map_err(CliError::Backend)
        }
        Some(arg) => Err(CliError::Message(format!(
            "unsupported argument `{}`",
            arg.to_string_lossy()
        ))),
    }
}

enum CliError {
    Backend(BackendError),
    Message(String),
}

impl CliError {
    fn exit_code(&self) -> ExitCode {
        match self {
            Self::Backend(BackendError::Store(_)) => ExitCode::from(STORE_FAILURE_EXIT_CODE),
            Self::Backend(BackendError::Transport(_)) | Self::Message(_) => ExitCode::FAILURE,
        }
    }

    fn stderr_line(&self) -> String {
        match self {
            Self::Backend(BackendError::Store(error)) => store_failure_line(error),
            Self::Backend(BackendError::Transport(_)) | Self::Message(_) => {
                format!("kqode failed: {self}")
            }
        }
    }
}

impl std::fmt::Display for CliError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Backend(error) => write!(formatter, "{error}"),
            Self::Message(message) => formatter.write_str(message),
        }
    }
}

fn store_failure_line(error: &StoreError) -> String {
    let message = error.to_string();
    if message.starts_with(STORE_FATAL_SENTINEL) {
        message
    } else {
        format!("{STORE_FATAL_SENTINEL} {message}")
    }
}
