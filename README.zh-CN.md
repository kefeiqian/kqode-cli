# KQode

[English](README.md) | **简体中文**

[![CI](https://github.com/kefeiqian/kqode-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/kefeiqian/kqode-cli/actions/workflows/ci.yml)
[![Release](https://github.com/kefeiqian/kqode-cli/actions/workflows/release.yml/badge.svg)](https://github.com/kefeiqian/kqode-cli/actions/workflows/release.yml)
[![GitHub Pages](https://github.com/kefeiqian/kqode-cli/actions/workflows/github-pages.yml/badge.svg)](https://github.com/kefeiqian/kqode-cli/actions/workflows/github-pages.yml)
[![GitHub release](https://img.shields.io/github/v/release/kefeiqian/kqode-cli?logo=github)](https://github.com/kefeiqian/kqode-cli/releases/latest)
[![License](https://img.shields.io/badge/license-MIT%20OR%20Apache--2.0-blue.svg)](#许可证)
[![Made with Rust](https://img.shields.io/badge/Rust-2024_edition-orange.svg?logo=rust)](https://www.rust-lang.org/)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.zh-CN.md)
[![GitHub stars](https://img.shields.io/github/stars/kefeiqian/kqode-cli?logo=github)](https://github.com/kefeiqian/kqode-cli/stargazers)

KQode 是一个以 Rust 为核心（Rust-first）的 Coding Agent 应用，并以 Tauri 和
React 桌面应用作为主要交互界面。同一套 Rust 运行时也支持命令行和 headless
执行，但 KQode 不提供终端界面（TUI）。

项目目前处于地基阶段：已提交的实现规模还很小，产品方向会随应用实现持续演进。

## 开发博客

KQode 以开放的方式构建，其文档站点同时也是一个**开发博客**——既讲解构建路线，也
作为项目从一个起步 crate 成长为完整编码智能体框架的实时日记。

- 在线阅读：<https://kefeiqian.github.io/kqode-cli/>
- 提供 简体中文（默认）和 English 两种语言。
- 源文件位于 [`blog/`](blog/)，并由 GitHub Pages 工作流自动发布。

博客以一篇介绍和开发方式开篇，随后按实现单元逐一推进，与 `U#` 提交标签一一对应。
每篇文章记录的是该步骤背后的推理、决策与取舍，而不仅仅是最终代码。

## 方向

KQode 围绕 Rust 核心设计，该核心负责智能体执行、提供方（provider）归一化、工具、
虚拟文件操作、沙箱策略、会话日志、回放与评测。正式产品界面是由 Tauri 托管的
React 桌面应用。

```text
React 桌面界面
  -> Tauri IPC
同一进程内的 Rust 核心
  -> agent loop
  -> provider adapter
  -> tool registry
  -> VFS and sandbox
  -> session store and trace log
  -> eval runner
```

首个公开的成果证明，是一个本地 Coding Agent 应用：它能够安全地修改本仓库、展示
差异（diff）、运行检查、记录 trace 证据，并恢复或回放该会话。桌面应用是主要
交互体验，CLI 和 headless 模式则复用同一个 Rust 核心来支持自动化运行。

## 仓库结构

- `crates/kqode-core/` - Provider-neutral 运行时 contracts 与共享核心逻辑。
- `crates/kqode-provider/` - 基于 `kqode-core` 的具体模型 Provider 适配器。
- `crates/kqode-desktop/` - Tauri 桌面应用，React/Vite 前端位于其
  `frontend/` 子目录。
- `crates/kqode-cli/` - Headless `kqode` 命令行 package。
- `xtask/` - 面向 Cargo 的开发者自动化命令。
- `blog/` - 发布到 GitHub Pages 的 Docusaurus 文档站点。
- `docs/` - 需求、架构、实现、评测与构建路线文档。

## 开发

安装 Rust 1.94.0、Bun 1.3.12 和 Git，然后在仓库根目录运行以下命令。

```bash
cargo build
cargo xtask desktop-dev
cargo test --workspace
cargo fmt --all --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo xtask workspace-boundaries
```

列出自动化命令：

```bash
cargo xtask help
```

### 桌面应用

使用 Cargo 封装的命令启动 Tauri 桌面应用：

```bash
cargo xtask desktop-dev
```

该命令会在缺少依赖时运行 Bun 安装，然后启动 Vite 前端和 Tauri 应用。

### 分发

版本标签会将 macOS、Linux 和 Windows 的原生 Tauri 安装包发布到 GitHub Releases。

维护者命令：

```bash
cargo xtask set-version X.Y.Z  # 打标签前，统一提升所有清单中的版本号
```

[分发注册指南](docs/release/kqode_distribution_registration.md)详细介绍了 GitHub
Release 桌面安装包发布流程。

### 文档站点

[开发博客](#开发博客)是位于 `blog/` 下的 Docusaurus 站点，由 GitHub Pages 工作流
部署。使用面向 Cargo 的 xtask 命令进行开发：

```bash
cargo xtask blog-install
cargo xtask blog-build
cargo xtask blog-typecheck
cargo xtask blog-serve
cargo xtask blog-serve-en
cargo xtask blog-preview
```

## 贡献

欢迎贡献——构建说明、约定与 pull request 流程请见
[`CONTRIBUTING.zh-CN.md`](CONTRIBUTING.zh-CN.md)。

## 许可证

KQode 采用以下任一许可证进行双重授权：

- Apache License, Version 2.0（[`LICENSE-APACHE`](LICENSE-APACHE) 或
  <https://www.apache.org/licenses/LICENSE-2.0>）
- MIT license（[`LICENSE-MIT`](LICENSE-MIT) 或
  <https://opensource.org/licenses/MIT>）

由你选择其一。

除非你明确另行声明，否则依据 Apache-2.0 许可证的定义，任何你有意提交并被纳入
KQode 的贡献，都应按上述方式进行双重授权，且不附加任何其他条款或条件。
