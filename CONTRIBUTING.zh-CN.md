# 为 KQode 做贡献

[English](CONTRIBUTING.md) | **简体中文**

感谢你对 KQode 的关注！KQode 是一个以 Rust 为核心（Rust-first）的 Coding Agent
应用，并以 React 和 Tauri 桌面应用作为主要交互界面。Rust 运行时也支持命令行和
headless 执行；KQode 不提供 TUI。项目仍处于地基阶段，因此我们欢迎各种形式的
贡献、问题反馈与设计建议。

本指南介绍如何构建项目、我们遵循的约定，以及如何让改动进入评审。
[`AGENTS.md`](AGENTS.md) 是仓库约定的权威来源——在进行任何非琐碎改动之前，请先
阅读它。

## 参与方式

- 通过创建 issue 报告缺陷或提出新功能建议。
- 改进文档，包括 [`blog/`](blog/) 下的开发博客。
- 通过向 `main` 分支提交 pull request 来贡献代码改动。

## 仓库结构

参见 README 中的[仓库结构](README.zh-CN.md#仓库结构)，其中概览了 `crates/`、
`xtask/`、`blog/` 与 `docs/`。

## 前置条件

- 通过 [rustup](https://rustup.rs/) 安装 **Rust 1.94.0 或更高版本**。仓库中提交的
  `rust-toolchain.toml` 会为构建、测试以及所有 `cargo xtask` 自动化命令选择受支持
  的基线版本。
- 用于桌面前端和文档站点的 **Bun 1.3.12**。
- **Git**。

日常桌面应用和文档站点工作通过面向 Cargo 的 `cargo xtask` 命令驱动。针对前端的
聚焦检查使用 `crates/kqode-desktop/frontend/` 下已有的 Bun 脚本。

## 快速开始

```bash
git clone https://github.com/kefeiqian/kqode-cli.git
cd kqode-cli
cargo build
cargo xtask desktop-dev
```

使用以下命令列出可用的自动化命令：

```bash
cargo xtask help
```

## 开发命令

请在仓库根目录运行以下命令。

### Rust 核心

```bash
cargo build
cargo xtask desktop-dev
cargo test --workspace
cargo test -p <crate-name> <test_name>   # 只运行单个测试
cargo fmt --all --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo xtask workspace-boundaries
```

### 桌面应用

通过面向 Cargo 的命令启动 Tauri 应用：

```bash
cargo xtask desktop-dev
```

在 `crates/kqode-desktop/frontend/` 下运行聚焦前端检查：

```bash
bun run typecheck
bun run build
```

### 文档站点

```bash
cargo xtask blog-install
cargo xtask blog-build
cargo xtask blog-typecheck
cargo xtask blog-serve
cargo xtask blog-serve-en
cargo xtask blog-preview
```

### Windows 注意事项

在 Windows 上，`cargo xtask` 已可并行运行：别名会把 xtask 构建并运行在私有的
`target\xtask` 目录中（与工作区的 `target\` 分开），因此快速命令不会去重新链接
其他进程正在占用的可执行文件。快速命令可以照常运行，也可以并行运行。长时间运行的
服务器命令（`blog-serve`、`blog-serve-en` 和 `blog-preview`）会在整个会话期间
占用该可执行文件，因此请通过启动器运行它们——启动器只构建一次，然后运行每次调用
独立的副本，从而让规范可执行文件保持可被重新链接：

```powershell
./scripts/xtask.ps1 blog-serve   # Windows（PowerShell）
```

```bash
./scripts/xtask.sh blog-serve    # macOS/Linux
```

## 提交 pull request 之前

请确保相关检查在本地通过：

```bash
cargo fmt --all --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo test --workspace
cargo xtask workspace-boundaries
```

如果你改动了桌面前端，还请在 `crates/kqode-desktop/frontend/` 下运行
`bun run typecheck` 和 `bun run build`。如果你改动了博客，请运行
`cargo xtask blog-build`。

## 代码约定

- **请阅读 [`AGENTS.md`](AGENTS.md)**——它是仓库约定与架构边界的唯一权威来源。
- 保持源文件聚焦，理想情况下不超过约 200 行；在模块、组件或辅助函数变得更大之前
  先拆分，除非有记录在案的理由不这样做。
- 为非琐碎的公开 Rust 项用 rustdoc（`///`）注释编写文档，并为会以非显而易见的
  方式失败的函数添加 `# Errors` 小节。
- 避免硬编码协议名、事件名、状态字符串以及魔法数字；定义共享的枚举或具名常量，
  使 Rust 与 TypeScript 保持一致。
- 保持 `xtask` 命令模块是对可复用实现模块的薄封装。当你新增或重命名 xtask 命令
  时，请在 `.run/` 下按 `xtask: <command>` 命名规则添加对应且已提交的 IDE 运行
  配置。

## 提交信息

我们遵循 [Conventional Commits](https://www.conventionalcommits.org/)：
`type(scope): description`。

请使用最贴切的类型：`feat`、`fix`、`docs`、`refactor`、`test`、`chore`、`perf`、
`ci`、`style` 或 `build`。用祈使句写出聚焦于改动价值的标题，并在改动需要说明理由、
取舍或评审背景时补充正文。

本仓库中的示例：

```text
feat(desktop): add conversation history navigation
docs(readme): add development blog section and fix repo URLs
fix(blog): correct GitHub Pages baseUrl and repo name to kqode-cli
```

## Pull request

- 从 `main` 分支切出，并让每个 pull request 聚焦于单一关注点。
- 确保上述检查通过，并附上清晰的描述和可评审的差异（diff）。
- 关联相关的 issue。

## 许可证

KQode 采用 [MIT](LICENSE-MIT) 或 [Apache-2.0](LICENSE-APACHE) 双重授权，由你选择
其一。除非你明确另行声明，否则依据 Apache-2.0 许可证的定义，任何你有意提交并被
纳入 KQode 的贡献，都应按上述方式进行双重授权，且不附加任何其他条款或条件。
