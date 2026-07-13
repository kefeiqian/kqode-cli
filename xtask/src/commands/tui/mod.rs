use crate::commands::CommandSpec;

pub mod dev;
pub mod dev_here;
pub mod install;
pub mod prod;
pub mod test;
pub mod typecheck;

pub const DEV: CommandSpec = CommandSpec {
    name: "tui-dev",
    description: "Run the TUI from the workspace, choosing a fixture if missing",
    run: dev::run,
};

pub const DEV_HERE: CommandSpec = CommandSpec {
    name: "tui-dev-here",
    description: "Run the TUI from source against the current terminal directory",
    run: dev_here::run,
};

pub const PROD: CommandSpec = CommandSpec {
    name: "tui-prod",
    description: "Package the standalone kqode executable and run it from the workspace",
    run: prod::run,
};

pub const INSTALL: CommandSpec = CommandSpec {
    name: "tui-install",
    description: "Install the nested TUI package dependencies with Bun",
    run: install::run,
};

pub const TYPECHECK: CommandSpec = CommandSpec {
    name: "tui-typecheck",
    description: "Run the nested TUI TypeScript typecheck",
    run: typecheck::run,
};

pub const TEST: CommandSpec = CommandSpec {
    name: "tui-test",
    description: "Run the nested TUI test suite",
    run: test::run,
};

pub const COMMANDS: &[CommandSpec] = &[DEV, DEV_HERE, PROD, INSTALL, TYPECHECK, TEST];
