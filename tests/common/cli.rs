use std::process::{Command, Output};

pub fn run_cli(args: &[&str]) -> Output {
    Command::new(env!("CARGO_BIN_EXE_kqode"))
        .args(args)
        .output()
        .expect("binary runs")
}
