use crate::commands::CommandSpec;

pub mod dev;

pub const DEV: CommandSpec = CommandSpec {
    name: "desktop-dev",
    description: "Run the Tauri desktop application in development mode",
    run: dev::run,
};

pub const COMMANDS: &[CommandSpec] = &[DEV];
