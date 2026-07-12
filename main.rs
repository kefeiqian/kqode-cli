use std::{
    env,
    ffi::{OsStr, OsString},
    process::ExitCode,
};

use kqode::{
    backend::BackendError,
    protocol::{BACKEND_MODE_ARG, JSON_FLAG, PROMPT_FLAG},
    store::{STORE_FATAL_SENTINEL, Store, StoreError},
};

/// Process exit code used when the backend cannot open or migrate the store.
const STORE_FAILURE_EXIT_CODE: u8 = 75;

/// Process exit code used when a headless one-shot has no configured provider.
const NO_PROVIDER_EXIT_CODE: u8 = 78;

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
    let args: Vec<OsString> = env::args_os().skip(1).collect();

    match args.first() {
        None => {
            println!("KQode starter CLI. Use `cargo xtask tui-dev` for the first Ink TUI.");
            Ok(())
        }
        Some(arg) if arg.as_os_str() == OsStr::new(BACKEND_MODE_ARG) => {
            if args.len() > 1 {
                return Err(CliError::Message(format!(
                    "{BACKEND_MODE_ARG} does not accept extra argument `{}`",
                    args[1].to_string_lossy()
                )));
            }

            kqode::backend::run_stdio().map_err(CliError::Backend)
        }
        Some(_) => run_headless(&args),
    }
}

/// Runs the headless one-shot (`--prompt`/`--json`): resolve the prompt from the
/// inline value or stdin, drive one completion, and print the result.
fn run_headless(args: &[OsString]) -> Result<(), CliError> {
    let parsed = parse_headless(args)?;
    let prompt = match parsed.prompt {
        Some(text) => text,
        None => read_stdin()?,
    };
    if prompt.trim().is_empty() {
        return Err(CliError::Message(
            "no prompt provided (pass text after --prompt, or pipe it on stdin)".to_owned(),
        ));
    }

    kqode::secrets::init_keychain_backend();
    let store = Store::open_or_bootstrap()
        .map_err(|error| CliError::Backend(BackendError::Store(error)))?;
    match kqode::headless::run_prompt(&store, &prompt, parsed.json) {
        Ok(output) => {
            println!("{output}");
            Ok(())
        }
        Err(kqode::headless::HeadlessError::NoProvider) => Err(CliError::NoProvider),
        Err(kqode::headless::HeadlessError::Provider(error)) => {
            Err(CliError::Message(format!("provider error: {error}")))
        }
    }
}

/// Parsed headless flags. `prompt` is `None` when the prompt is read from stdin.
struct HeadlessArgs {
    prompt: Option<String>,
    json: bool,
}

/// Parses the headless flag set (`--prompt [text]`, `--json`). Errors on any
/// unrecognized argument or when `--prompt` is absent.
fn parse_headless(args: &[OsString]) -> Result<HeadlessArgs, CliError> {
    let mut prompt = None;
    let mut json = false;
    let mut seen_prompt = false;
    let mut index = 0;
    while index < args.len() {
        let arg = &args[index];
        if arg.as_os_str() == OsStr::new(PROMPT_FLAG) {
            seen_prompt = true;
            if let Some(next) = args.get(index + 1) {
                let value = next.to_string_lossy();
                if value == "-" {
                    // Explicit stdin sentinel: consume it; the prompt stays None.
                    index += 2;
                    continue;
                }
                // A following token that isn't a `--flag` is the inline prompt.
                if !value.starts_with("--") {
                    prompt = Some(value.into_owned());
                    index += 2;
                    continue;
                }
            }
            // No value, or the next token is a `--flag`: read from stdin.
            index += 1;
        } else if arg.as_os_str() == OsStr::new(JSON_FLAG) {
            json = true;
            index += 1;
        } else {
            return Err(CliError::Message(format!(
                "unsupported argument `{}`",
                arg.to_string_lossy()
            )));
        }
    }
    if !seen_prompt {
        return Err(CliError::Message(format!(
            "unrecognized arguments; expected `{PROMPT_FLAG} <text>`"
        )));
    }
    Ok(HeadlessArgs { prompt, json })
}

/// Reads the entire prompt from stdin.
fn read_stdin() -> Result<String, CliError> {
    use std::io::Read as _;
    let mut buffer = String::new();
    std::io::stdin()
        .read_to_string(&mut buffer)
        .map_err(|error| CliError::Message(format!("failed to read stdin: {error}")))?;
    Ok(buffer)
}

enum CliError {
    Backend(BackendError),
    NoProvider,
    Message(String),
}

impl CliError {
    fn exit_code(&self) -> ExitCode {
        match self {
            Self::Backend(BackendError::Store(_)) => ExitCode::from(STORE_FAILURE_EXIT_CODE),
            Self::NoProvider => ExitCode::from(NO_PROVIDER_EXIT_CODE),
            Self::Backend(BackendError::Transport(_)) | Self::Message(_) => ExitCode::FAILURE,
        }
    }

    fn stderr_line(&self) -> String {
        match self {
            Self::Backend(BackendError::Store(error)) => store_failure_line(error),
            Self::NoProvider => {
                "no provider configured; connect one with `/connect` in the TUI before using --prompt"
                    .to_owned()
            }
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
            Self::NoProvider => formatter.write_str("no provider configured"),
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

#[cfg(test)]
mod tests {
    use super::*;

    fn os(args: &[&str]) -> Vec<OsString> {
        args.iter().map(OsString::from).collect()
    }

    fn parse_ok(args: &[&str]) -> HeadlessArgs {
        parse_headless(&os(args)).unwrap_or_else(|_| panic!("expected `{args:?}` to parse"))
    }

    #[test]
    fn parses_inline_prompt_and_json_flag() {
        let parsed = parse_ok(&["--prompt", "hello", "--json"]);
        assert_eq!(parsed.prompt.as_deref(), Some("hello"));
        assert!(parsed.json);
    }

    #[test]
    fn prompt_dash_reads_from_stdin() {
        let parsed = parse_ok(&["--prompt", "-"]);
        assert_eq!(parsed.prompt, None);
        assert!(!parsed.json);
    }

    #[test]
    fn prompt_followed_by_flag_reads_from_stdin() {
        let parsed = parse_ok(&["--prompt", "--json"]);
        assert_eq!(parsed.prompt, None);
        assert!(parsed.json);
    }

    #[test]
    fn negative_number_prompt_is_inline_not_stdin() {
        let parsed = parse_ok(&["--prompt", "-5 degrees"]);
        assert_eq!(parsed.prompt.as_deref(), Some("-5 degrees"));
    }

    #[test]
    fn missing_prompt_flag_is_an_error() {
        assert!(parse_headless(&os(&["--json"])).is_err());
    }

    #[test]
    fn unknown_flag_is_an_error() {
        assert!(parse_headless(&os(&["--prompt", "hi", "--bogus"])).is_err());
    }
}
