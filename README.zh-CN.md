# KQode

[English](README.md) | **简体中文**

<p align="center">
  <a href="https://github.com/kefeiqian/kqode-cli/actions/workflows/ci.yml"><img src="https://github.com/kefeiqian/kqode-cli/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/kefeiqian/kqode-cli/actions/workflows/release.yml"><img src="https://github.com/kefeiqian/kqode-cli/actions/workflows/release.yml/badge.svg" alt="Release"></a>
  <a href="https://github.com/kefeiqian/kqode-cli/actions/workflows/github-pages.yml"><img src="https://github.com/kefeiqian/kqode-cli/actions/workflows/github-pages.yml/badge.svg" alt="GitHub Pages"></a>
</p>
<p align="center">
  <a href="https://www.npmjs.com/package/@kqode/kqode-cli"><img src="https://img.shields.io/npm/v/@kqode/kqode-cli?logo=npm" alt="npm"></a>
  <a href="https://github.com/kefeiqian/kqode-cli/releases/latest"><img src="https://img.shields.io/github/v/release/kefeiqian/kqode-cli?logo=github" alt="GitHub release"></a>
  <a href="#许可证"><img src="https://img.shields.io/badge/license-MIT%20OR%20Apache--2.0-blue.svg" alt="License"></a>
</p>
<p align="center">
  <a href="https://www.rust-lang.org/"><img src="https://img.shields.io/badge/Rust-2024_edition-orange.svg?logo=rust" alt="Made with Rust"></a>
  <a href="CONTRIBUTING.zh-CN.md"><img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg" alt="PRs welcome"></a>
  <a href="https://github.com/kefeiqian/kqode-cli/stargazers"><img src="https://img.shields.io/github/stars/kefeiqian/kqode-cli?logo=github" alt="GitHub stars"></a>
</p>

KQode 是一个以 Rust 为核心（Rust-first）的编码智能体（coding agent）框架，并将
TypeScript Ink 作为其正式的终端界面（TUI）。项目目前处于地基阶段：已提交的实现
规模还很小，而产品方向主要体现在规划与架构文档中。

## 开发博客

KQode 以开放的方式构建，其文档站点同时也是一个**开发博客**——既讲解构建路线，也
作为项目从一个起步 crate 成长为完整编码智能体框架的实时日记。

- 在线阅读：<https://kefeiqian.github.io/kqode-cli/>
- 提供 简体中文（默认）和 English 两种语言。
- 源文件位于 [`blog/`](blog/)，并由 GitHub Pages 工作流自动发布。

博客以一篇介绍和开发方式开篇，随后按实现单元逐一推进（`U1` 脚手架、`U2` 交互式
主屏……），与 `U#` 提交标签一一对应。每篇文章记录的是该步骤背后的推理、决策与
取舍，而不仅仅是最终代码。

## 链接

- 架构规范：[`docs/kqode_architecture_spec.md`](docs/kqode_architecture_spec.md)
- 构建路线：[`docs/kqode_build_path.md`](docs/kqode_build_path.md)
- 详细需求：[`docs/kqode_detailed_requirements_index.md`](docs/kqode_detailed_requirements_index.md)

## 方向

KQode 围绕一个无头（headless）的 Rust 核心设计，该核心负责智能体执行、提供方
（provider）归一化、工具、虚拟文件操作、沙箱策略、会话日志、回放与评测。终端体验
将始终基于 Ink 构建，而相关的协议客户端以及未来的 IDE 或 Web 配套程序则以
TypeScript 实现。

```text
TypeScript Ink TUI
  -> JSON-RPC or JSONL protocol
Rust kqode daemon / CLI
  -> agent loop
  -> provider adapter
  -> tool registry
  -> VFS and sandbox
  -> session store and trace log
  -> eval runner
```

首个公开的成果证明，是一个本地终端智能体：它能够安全地修改本仓库、展示差异
（diff）、运行检查、记录 trace 证据，并恢复或回放该会话。

## 仓库结构

- `src/` - 起步的 Rust crate。
- `xtask/` - 面向 Cargo 的开发者自动化命令。
- `tui/` - 内嵌的 TypeScript Ink TUI 包。
- `blog/` - 发布到 GitHub Pages 的 Docusaurus 文档站点。
- `docs/` - 需求、架构、实现、评测与构建路线文档。

## 开发

在仓库根目录运行以下命令。

```bash
cargo build
cargo run
cargo test --workspace
cargo fmt --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
```

列出自动化命令：

```bash
cargo xtask help
```

### TUI

请使用面向 Cargo 的 xtask 命令，而不要直接调用包管理器。

```bash
cargo xtask tui-install    # 安装内嵌 TUI 的依赖
cargo xtask tui-typecheck  # 对 TUI 做类型检查（tsc --noEmit）
cargo xtask tui-test       # 运行 TUI 测试（vitest）
cargo xtask tui-dev        # 在一次性 fixture 工作区中运行 TUI
cargo xtask tui-dev-here   # 从源码运行 TUI，并使用当前终端目录作为 cwd
```

`cargo xtask tui-dev` 会针对一份复制出来的 fixture 工作区运行 Ink TUI，因此显示的
工作目录是一个真实的项目，而不是 KQode 仓库本身。如果要在已有项目中 dogfood，
可以从该项目目录运行 `/path/to/KQode/scripts/xtask.sh tui-dev-here`，让源码模式
使用当前终端目录，与打包后的 `kqode` 可执行文件保持一致。目前 TUI 与一个本地 Rust
JSON-RPC 后端通信；该后端会对每个提交的 prompt 做确认，并将可恢复的本地会话
历史持久化到 `~/.kqode/`。`/help`、`/clear`、`/login`、`/model` 与 `/resume`
现已连接到真实的 TUI 界面或后端流程；它仍然尚未调用模型、运行工具或执行智能体
循环，而提及（mention）支持目前仍是占位符。

使用以下命令显式准备或重置该 fixture 工作区：

```bash
cargo xtask fixture-prepare-react-simple   # 已提交的简单 React fixture
cargo xtask fixture-prepare-react-complex  # 缓存的官方 Vite React 模板
```

`tui-dev` 会按需准备工作区，因此仅在需要重置或切换到特定 fixture 时才需要这些命令。

### 独立可执行文件

`kqode` 以单个原生可执行文件的形式发布，将 Ink 前端与预构建的 Rust 后端打包在
一起，因此打包后的用户既不需要 Cargo、Rust，也不需要 Node 或 npm。

```bash
cargo xtask package    # 在 tui/dist/kqode[.exe] 构建独立可执行文件
cargo xtask tui-prod   # 构建并运行独立可执行文件
```

仅在这种源码模式构建时才需要 Cargo。打包后的可执行文件会将其内嵌的后端物化
（materialize）到 `~/.kqode/` 下的每用户缓存中，并运行与源码模式相同的本地 ACK
流程。

### 分发

每个安装渠道都从 GitHub Release 资源交付同一个独立可执行文件——没有任何渠道从
源码构建：

- 直接下载 `kqode-<os>-<arch>.tar.gz` / `.zip` 以及校验和。
- npm：`npm install -g @kqode/kqode-cli` 会在安装时下载并校验对应的 release 归档。
- Homebrew 与 winget 清单，指向 Release 资源的 URL。

维护者命令：

```bash
cargo xtask package-release    # 为宿主目标生成归档 + 校验和
cargo xtask set-version X.Y.Z  # 打标签前，统一提升所有清单中的版本号
```

[分发注册指南](docs/release/kqode_distribution_registration.md)详细介绍了 GitHub
Release、npm、Homebrew 与 winget 的发布流程。

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
