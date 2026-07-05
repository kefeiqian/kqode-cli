use crate::commands::CommandSpec;

pub mod build;
pub mod dev;
pub mod install;
pub mod preview;
pub mod serve;
pub mod serve_en;
pub mod typecheck;

pub const INSTALL: CommandSpec = CommandSpec {
    name: "blog-install",
    description: "Install the Docusaurus blog dependencies with Bun",
    run: install::run,
};

pub const BUILD: CommandSpec = CommandSpec {
    name: "blog-build",
    description: "Build the Docusaurus blog",
    run: build::run,
};

pub const TYPECHECK: CommandSpec = CommandSpec {
    name: "blog-typecheck",
    description: "Run the Docusaurus blog TypeScript typecheck",
    run: typecheck::run,
};

pub const SERVE: CommandSpec = CommandSpec {
    name: "blog-serve",
    description: "Run the default-locale Docusaurus blog dev server with hot reload",
    run: serve::run,
};

pub const SERVE_EN: CommandSpec = CommandSpec {
    name: "blog-serve-en",
    description: "Run the English Docusaurus blog dev server with hot reload",
    run: serve_en::run,
};

pub const DEV: CommandSpec = CommandSpec {
    name: "blog-dev",
    description: "Run the Docusaurus blog dev server with auto-restart on structural changes",
    run: dev::run,
};

pub const PREVIEW: CommandSpec = CommandSpec {
    name: "blog-preview",
    description: "Serve the production Docusaurus blog build locally",
    run: preview::run,
};

pub const COMMANDS: &[CommandSpec] = &[INSTALL, BUILD, TYPECHECK, SERVE, SERVE_EN, DEV, PREVIEW];
