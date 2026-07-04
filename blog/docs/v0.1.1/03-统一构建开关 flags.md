---
sidebar_position: 3
title: 3. 统一构建开关 flags
---

[`f13b6d1b`](https://github.com/kefeiqian/KQode/commit/f13b6d1baea21466ada1e08e42209ffd04193335) 做的是一次 refactor：统一 TUI 和 Rust core 的 build flags。

这类改动不直接增加用户界面，但会显著降低后续功能的分叉成本。KQode 是 Rust-first coding-agent harness，同时有 TypeScript Ink TUI。只要存在 source mode、test mode 和 packaged prod mode，就一定会有“某段代码只在某个环境运行”的需求。如果 TUI 用一套名字，Rust core 用另一套名字，后续会出现很多难以搜索的条件分支。

![TUI 与 Rust core 共享 dev test prod 环境语义](../images/v0-1-1-build-flags/build-flags-map.png)

## 之前不一致在哪里

在这个 commit 之前，TUI 已经有 `__DEV__`、`__TEST__`、`__PROD__` 这组三态开关，并通过 Bun `--define`、Vitest `define` 和 dev shim 注入。Rust core 侧还没有对应的 build-time 环境模块。

这会带来两个问题：

1. Rust 代码如果需要区分 prod 和 dev，很容易直接读 runtime env var。这样条件不能被编译器消除，也不利于把 prod-only 或 dev-only 依赖隔离。
2. TUI 的 packaged binary 会 dead-code-eliminate 不需要的分支，但 Rust backend 只能靠临时约定。两边对“test 是什么”“prod 是什么”的解释可能漂移。

这次改动的目标不是让 Rust 和 TypeScript 共享同一个文件，而是共享同一套语义和命名：`dev`、`test`、`prod`。

## Rust core 的新入口：`build.rs`

commit 新增 [`build.rs`](https://github.com/kefeiqian/KQode/blob/f13b6d1baea21466ada1e08e42209ffd04193335/build.rs)，把 `KQODE_ENV` 转换成 Rust cfg：

```rust
/// Build variable selecting the environment. Mirrors the TUI's `KQODE_ENV`.
const ENV_VAR: &str = "KQODE_ENV";

/// Accepted `KQODE_ENV` inputs (validated below).
const ALLOWED: [&str; 3] = ["dev", "test", "prod"];

/// Value used when `KQODE_ENV` is unset (plain `cargo build` / `cargo test`).
const DEFAULT: &str = "dev";
```

真正发给 rustc 的 cfg 只有 `__DEV__` 和 `__PROD__`：

```rust
    // `prod` is the only packaged deploy target; `dev`/`test` build a dev-style
    // binary (a `test` value still builds `__DEV__` — test-ness is `cfg(test)`).
    let cfg = if env == "prod" { "__PROD__" } else { "__DEV__" };
    println!("cargo::rustc-cfg={cfg}");
```

为什么没有自定义 `__TEST__` cfg？因为 Rust 已经有内建的 `cfg(test)`。重复定义一个 `__TEST__` 反而会制造歧义：到底测试语义来自 Cargo test harness，还是来自外部环境变量？这里选择复用 Rust 原生机制，让 `KQODE_ENV=test` 仍然走 dev-style binary，而真正的 test 判断交给 `cfg(test)`。

## Rust 运行时值：`BuildEnv`

新增的 [`src/build_env.rs`](https://github.com/kefeiqian/KQode/blob/f13b6d1baea21466ada1e08e42209ffd04193335/src/build_env.rs) 把编译期 cfg 包装成可读的 Rust enum：

```rust
/// The environments KQode is built for, selected by [`ENV_VAR`] at build time.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BuildEnv {
    /// Source checkout run with Cargo; the default when `KQODE_ENV` is unset.
    Dev,
    /// Test/eval build where product-wide test seams are active.
    Test,
    /// Packaged release that embeds and runs the backend.
    Prod,
}
```

`current()` 的优先级也写得很明确：

```rust
    pub const fn current() -> Self {
        #[cfg(test)]
        const CURRENT: BuildEnv = BuildEnv::Test;
        #[cfg(all(not(test), __PROD__))]
        const CURRENT: BuildEnv = BuildEnv::Prod;
        #[cfg(all(not(test), not(__PROD__)))]
        const CURRENT: BuildEnv = BuildEnv::Dev;

        CURRENT
    }
```

这里的设计给了两种使用方式：

- 需要条件编译时，用 `#[cfg(__PROD__)]` 或 `#[cfg(test)]`。
- 需要日志、telemetry 或 protocol 字段时，用 `BuildEnv::current().as_str()`。

这比散落 `std::env::var("KQODE_ENV")` 更可维护，因为所有解释都集中在一个模块。

## TUI 侧的全局开关说明也被收口

TUI 的 [`tui/src/globals.d.ts`](https://github.com/kefeiqian/KQode/blob/f13b6d1baea21466ada1e08e42209ffd04193335/tui/src/globals.d.ts) 把三个裸全局变量写成了正式契约：

```ts
declare global {
  var __DEV__: boolean;
  var __TEST__: boolean;
  var __PROD__: boolean;
}
```

文件注释里强调了一个关键点：要直接使用裸标识符，例如 `if (__PROD__)`，不要包成 helper。原因是 Bun `--define` 和打包器的 dead-code elimination 需要看到字面量分支。如果写成 `isProd()`，打包器就不一定能把 dev branch 删除。

dev 模式没有 build step，所以新增 [`tui/src/devGlobals.ts`](https://github.com/kefeiqian/KQode/blob/f13b6d1baea21466ada1e08e42209ffd04193335/tui/src/devGlobals.ts)：

```ts
globalThis.__DEV__ = true;
globalThis.__TEST__ = false;
globalThis.__PROD__ = false;
```

这个 shim 只给 `tsx main.tsx` 用，不进入 packaged prod bundle。这样 source checkout 运行时不会因为裸读 `__DEV__` 而抛 `ReferenceError`。

## 常量也要集中

同一个 commit 还把若干字符串常量搬进 `tui/src/constants`。例如 [`tui/src/constants/backend.ts`](https://github.com/kefeiqian/KQode/blob/f13b6d1baea21466ada1e08e42209ffd04193335/tui/src/constants/backend.ts)：

```ts
/** Cargo bin target name for the Rust backend. */
export const CARGO_BINARY_NAME = 'kqode';

/** Cargo launcher command resolved from the hardened `PATH`. */
export const CARGO_COMMAND = 'cargo';

/** Default ceiling for a source-mode Cargo build before it is treated as hung. */
export const DEFAULT_BUILD_TIMEOUT_MS = 180_000;
```

这和 build flags 是同一类工程卫生：协议名、隐藏参数、timeout 和环境变量名都应该可搜索、可复用，而不是散落在调用点。

## 为什么这个 refactor 值得单独做

早期项目最容易为了“先跑起来”把环境判断写成临时 if。等到 package、release、test seam、eval harness 和 provider mock 都接进来后，这些临时 if 会变成最难拆的技术债。

这次统一 flags 的价值在于提前划清边界：TypeScript 负责 TUI 的 build-time define，Rust 负责 core 的 cfg，二者共享命名和语义，但不强行共享实现。这样既符合各自生态，又让后续跨边界行为保持一致。
