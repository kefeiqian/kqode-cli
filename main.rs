use std::{env, ffi::OsStr, process::ExitCode};

use kqode::protocol::BACKEND_MODE_ARG;

fn main() -> ExitCode {
    match run() {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("kqode failed: {error}");
            ExitCode::FAILURE
        }
    }
}

fn run() -> Result<(), String> {
    let mut args = env::args_os().skip(1);

    match args.next() {
        None => {
            println!("KQode starter CLI. Use `cargo xtask tui-dev` for the first Ink TUI.");
            Ok(())
        }
        Some(arg) if arg.as_os_str() == OsStr::new(BACKEND_MODE_ARG) => {
            if let Some(extra) = args.next() {
                return Err(format!(
                    "{BACKEND_MODE_ARG} does not accept extra argument `{}`",
                    extra.to_string_lossy()
                ));
            }

            kqode::backend::run_stdio().map_err(|error| error.to_string())
        }
        Some(arg) => Err(format!("unsupported argument `{}`", arg.to_string_lossy())),
    }
}
