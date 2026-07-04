---
sidebar_position: 3
title: 3. Rust XTask 自动化
---

上一篇我们创建了前端 TUI 项目。随着项目持续迭代，在研发 KQode 的过程中，会有越来越多的常用指令，比如：运行 Rust 构建、安装 TUI 依赖、执行前端 typecheck、启动 Docusaurus Blog、准备测试 fixture 等等。

这些命令如果直接散落在 README、package scripts、IDE 配置和 CI 脚本里，很快就会变得难以维护。所以这一篇先创建一个 Rust `xtask` 自动化入口，把项目里的常用工程任务统一收口。

## 什么是 xtask

`xtask` 是 Rust 社区里常见的一种项目自动化模式。它不是 Cargo 官方的固定命令，而是一种约定：在 workspace 里放一个单独的 `xtask` crate，然后通过下面这种方式运行项目自定义任务：

```bash
cargo xtask help
cargo xtask tui-test
cargo xtask blog-build
```

KQode 这里采用的是 [matklad/cargo-xtask](https://github.com/matklad/cargo-xtask) 介绍的思路：把项目维护脚本写成一个普通 Rust crate，让自动化逻辑和业务代码一样可以被模块化、测试和重构。

它解决的是“项目脚本放在哪里”的问题。相比把逻辑写在 shell 脚本、PowerShell 脚本或者 npm scripts 里，`xtask` 有几个好处：

1. 可以用 Rust 写跨平台逻辑，减少 Windows、macOS、Linux 之间的脚本差异。
2. 可以复用 Rust 的类型、模块和测试能力，而不是把复杂逻辑塞进一行命令。
3. 可以和主项目共用 Cargo workspace，开发者只要有 Rust 工具链就能运行。
4. 可以把命令入口保持稳定，底层实现以后再逐步重构。

对于 KQode 这种 Rust-first 项目来说，`xtask` 很适合作为工程自动化入口。Rust 核心、TypeScript TUI、Docusaurus 文档站和后续 fixture/eval 都可以通过它统一调度。

## 把 xtask 加入 workspace

KQode 的根目录 [`Cargo.toml`](https://github.com/kefeiqian/KQode/blob/99949b9fe7698a1f0b87acda232281cbaeb4d81d/Cargo.toml) 把主 crate 和 `xtask` 都放进同一个 workspace：

```toml
[workspace]
members = [".", "xtask"]
resolver = "3"
```

这样 `cargo xtask ...` 会自动找到 `xtask` 这个 package，并执行它的二进制入口。[`xtask/Cargo.toml`](https://github.com/kefeiqian/KQode/blob/99949b9fe7698a1f0b87acda232281cbaeb4d81d/xtask/Cargo.toml) 保持非常轻量：

```toml
[package]
name = "xtask"
version = "0.1.0"
edition = "2024"
```

目前 `xtask` 不需要额外依赖。后续如果某些自动化逻辑需要解析配置、生成文件或处理 JSON，再按需添加依赖。

## 命令入口保持简单

[`xtask/src/main.rs`](https://github.com/kefeiqian/KQode/blob/99949b9fe7698a1f0b87acda232281cbaeb4d81d/xtask/src/main.rs) 只负责三件事：

1. 找到仓库根目录。
2. 读取用户传入的命令名。
3. 把命令分发给 `commands` 模块。

简化后的结构如下：

```rust
mod commands;
mod support;

use std::{env, process::ExitCode};

fn main() -> ExitCode {
    match run() {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("xtask failed: {error}");
            ExitCode::FAILURE
        }
    }
}

fn run() -> Result<(), String> {
    let repo_root = support::paths::repo_root();
    let command = env::args().nth(1);

    commands::run(command.as_deref(), &repo_root)
}
```

这里刻意没有把具体任务逻辑写在 `main.rs` 里。`main.rs` 应该只是一个薄入口，真正的自动化实现放到可复用模块里。这样以后命令越来越多时，入口文件不会变成一个巨大的 `match`。

## 用 CommandSpec 注册命令

KQode 的 `xtask` 用 `CommandSpec` 描述每一个命令：

```rust
pub struct CommandSpec {
    pub name: &'static str,
    pub description: &'static str,
    pub run: fn(&Path) -> Result<(), String>,
}
```

每个命令都包含：

- `name`：命令名，例如 `tui-test`。
- `description`：在 `cargo xtask help` 里展示的说明。
- `run`：真正执行命令的函数。

然后按功能分组注册：

```rust
const COMMAND_GROUPS: &[&[CommandSpec]] = &[
    fixture::COMMANDS,
    tui::COMMANDS,
    blog::COMMANDS,
    HELP_COMMANDS,
];
```

这种结构比一个很长的手写 `match` 更容易维护。新增一个命令时，只需要在对应分组里定义 `CommandSpec`，再加入该分组的 `COMMANDS` 列表。

为了避免命令名重复，`commands` 模块里还加了一个测试：

```rust
#[test]
fn command_names_are_unique() {
    let mut names = HashSet::new();

    for command in all_commands() {
        assert!(
            names.insert(command.name),
            "duplicate xtask command: {}",
            command.name
        );
    }
}
```

这类测试很小，但很实用。因为 `xtask` 是团队常用入口，一旦命令名冲突，开发者会直接在本地命令行里遇到问题。

## 统一 TUI 和 blog 命令

KQode 里有两个 TypeScript 子项目：

- `tui/`：Ink 前端 TUI。
- `blog/`：Docusaurus 文档站。

这两个目录各自有 package 配置，但日常开发不直接要求开发者记住每个子目录里的命令，而是优先通过 `cargo xtask` 调用：

```bash
cargo xtask tui-install
cargo xtask tui-typecheck
cargo xtask tui-test
cargo xtask tui-dev
```

```bash
cargo xtask blog-install
cargo xtask blog-typecheck
cargo xtask blog-build
cargo xtask blog-serve
cargo xtask blog-serve-en
cargo xtask blog-preview
```

这样做的目的不是隐藏 Bun 或 Docusaurus，而是给整个仓库提供一个稳定入口。以后如果底层从 Bun 换成其他工具，或者命令参数需要调整，调用方仍然可以继续使用同一组 `cargo xtask ...` 命令。

[`support::bun`](https://github.com/kefeiqian/KQode/blob/99949b9fe7698a1f0b87acda232281cbaeb4d81d/xtask/src/support/bun.rs) 负责封装 Bun 调用，并根据操作系统选择 `bun` 或 `bun.exe`：

```rust
pub fn command() -> &'static str {
    if cfg!(windows) { "bun.exe" } else { "bun" }
}
```

这也是 `xtask` 的价值之一：跨平台细节集中在 Rust helper 里，而不是散落在每个文档和脚本中。

## 自动补齐依赖安装

对于文档站和 TUI，`xtask` 还可以在运行前检查依赖是否存在。例如 [`xtask/src/support/blog.rs`](https://github.com/kefeiqian/KQode/blob/99949b9fe7698a1f0b87acda232281cbaeb4d81d/xtask/src/support/blog.rs) 里的 blog 构建前会先确认 Docusaurus 可执行文件是否已经安装：

```rust
fn ensure_dependencies(repo_root: &Path) -> Result<(), String> {
    let docusaurus = paths::blog_bin(repo_root, "docusaurus");

    if docusaurus.is_file() {
        Ok(())
    } else {
        println!("Blog dependencies are missing; running bun install.");
        install(repo_root)
    }
}
```

这样新 checkout 的仓库也能直接运行：

```bash
cargo xtask blog-build
```

如果依赖缺失，`xtask` 会先执行安装，再继续构建。这个逻辑写在 Rust 里，比让每个开发者手动记住“先进入 blog 目录，再 bun install，再 bun run build”更可靠。

## 给 IDE 和 CI 一个稳定接口

KQode 同时也会为 `xtask` 命令维护 IDE run profile。比如 `tui-test`、`blog-build` 这些命令，在 RustRover 或 JetBrains IDE 里可以直接点击运行。

这背后的原则是：**IDE、CI、文档和人类命令行都调用同一个自动化入口**。不要让 IDE 里是一套命令，CI 里是另一套命令，README 里又是第三套命令。

这些 run profile 会放在仓库根目录的 [`.run/`](https://github.com/kefeiqian/KQode/tree/99949b9fe7698a1f0b87acda232281cbaeb4d81d/.run) 目录里，并跟随代码一起提交。以 [`xtask_tui_dev.run.xml`](https://github.com/kefeiqian/KQode/blob/99949b9fe7698a1f0b87acda232281cbaeb4d81d/.run/xtask_tui_dev.run.xml) 为例，它在 RustRover 里显示为 **xtask: tui-dev**，实际执行的是同一条 Cargo 命令：

```xml
<configuration default="false" name="xtask: tui-dev" type="CargoCommandRunConfiguration" factoryName="Cargo Command">
  <option name="command" value="run -p xtask -- tui-dev" />
  <option name="workingDirectory" value="file://$PROJECT_DIR$" />
  <option name="emulateTerminal" value="true" />
</configuration>
```

这样需要启动 TUI 时，可以在 IDE 右上角直接选择 **xtask: tui-dev** 并点击运行；CI 或命令行仍然执行 `cargo xtask tui-dev`。两边共用同一条 `xtask` 自动化路径。

后续新增或重命名 `xtask` 命令时，也要同步添加对应的 `.run/` 配置，让本地开发体验保持一致。

![RustRover 中选择 xtask tui-dev run configuration](../../images/rust-xtask/rustrover-xtask-tui-dev-run-configuration.png)

## 用 skill 创建新的 xtask 命令

为了方便后续继续创建新的 `xtask` 命令，我们也沉淀了一个新的 `kqode-new-xtask` skill。使用时只需要描述这条自动化命令要做什么，Agent 就会按照 KQode 的约定生成命令名、添加薄 wrapper、把复用逻辑放进 support 模块、注册 `CommandSpec`，并补上对应的 IDE run profile。

这个 skill 的目的不是替代工程判断，而是把“新增 xtask 命令”这件重复工作标准化。这样后面添加 eval、fixture、文档或 TUI 相关自动化时，不需要每次重新回忆目录结构、注册方式和验证命令。

## 小结

这一篇完成的是工程基础设施，不是用户可见功能。但它很重要：从现在开始，KQode 的常用开发任务都有了统一入口。

目前 `xtask` 已经覆盖：

- TUI 依赖安装、类型检查、测试和本地开发。
- blog 依赖安装、类型检查、构建和本地预览。
- fixture 工作区准备。
- help 命令和命令名唯一性测试。

接下来继续实现 KQode 功能时，就可以把重复的开发流程沉淀进 `xtask`，而不是让命令散落在不同工具里。对于一个 Coding Agent Harness 来说，这种自动化入口也会成为后续 eval、回放、fixture 和 CI 验证的基础。
