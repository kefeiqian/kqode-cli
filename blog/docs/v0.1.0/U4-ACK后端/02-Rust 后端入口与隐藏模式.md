---
sidebar_position: 2
title: 2. Rust 后端入口与隐藏模式
---

U4 的第一件事是把 Rust crate 从“只有一个 `src/main.rs` 的 Hello World binary”调整成“library + binary”。这不是为了提前复杂化工程结构，而是为了让后端逻辑可以被两个调用方复用：命令行 binary 负责进程入口，测试可以直接 import `kqode::protocol` 里的常量。

[`Cargo.toml`](https://github.com/kefeiqian/KQode/blob/f86f87f31e74ef3f27cd7ff22b70665e02b66b2e/Cargo.toml) 在 U4 中新增了 library 和 binary 显式配置：

```toml
[lib]
name = "kqode"
path = "src/lib.rs"

[[bin]]
name = "kqode"
path = "main.rs"
```

这个选择有两个直接影响。第一，crate 对外暴露的 Rust library 名称是 `kqode`，所以测试可以写 `use kqode::protocol::BACKEND_MODE_ARG;`。第二，binary 入口移到了仓库根目录的 [`main.rs`](https://github.com/kefeiqian/KQode/blob/f86f87f31e74ef3f27cd7ff22b70665e02b66b2e/main.rs)，而 `src/` 下面保留可复用模块。这样入口层不会和 backend protocol 逻辑揉在一起。

## 为什么用隐藏参数启动 backend

U4 没有把 backend mode 做成公开命令，比如 `kqode backend`。它使用的是 [`src/protocol.rs`](https://github.com/kefeiqian/KQode/blob/f86f87f31e74ef3f27cd7ff22b70665e02b66b2e/src/protocol.rs) 中定义的隐藏参数：

```rust
/// Hidden argument that starts the internal JSON-RPC backend loop.
pub const BACKEND_MODE_ARG: &str = "--__kqode-json-rpc-backend";
```

原因是这个 mode 不是用户产品入口，而是 TUI 和 Rust core 之间的内部 transport 入口。用户不应该需要记住它，也不应该把它当成稳定 CLI surface。隐藏参数保留了后续重构空间：未来可以换成 packaged binary、daemon、socket 或其他启动方式，而不破坏用户面对的 CLI 命令。

入口代码也非常克制：默认没有参数时只打印 starter 提示；只有传入完全匹配的隐藏参数时才进入 backend；多余参数直接报错。

```rust
fn run() -> Result<(), String> {
    let mut args = env::args_os().skip(1);

    match args.next() {
        None => {
            println!("KQode starter CLI. Use `cargo xtask tui-dev` for the first Ink TUI.");
            Ok(())
        }
        Some(arg) if arg.as_os_str() == OsStr::new(BACKEND_MODE_ARG) => {
            if let Some(extra) = args.next() {
                return Err(format!(
                    "{BACKEND_MODE_ARG} does not accept extra argument `{}`",
                    extra.to_string_lossy()
                ));
            }

            kqode::backend::run_stdio().map_err(|error| error.to_string())
        }
        Some(arg) => Err(format!("unsupported argument `{}`", arg.to_string_lossy())),
    }
}
```

这里的“严格”是有意的。Backend process 以后会由 TUI 自动启动，如果参数拼错或被额外参数污染，应该尽早失败并输出可见错误，而不是悄悄进入一个不确定状态。对 coding-agent harness 来说，启动路径必须可诊断，否则后面调试协议、进程生命周期和 UI 状态时会很痛苦。

## 为什么默认入口仍然保持无害

U4 删除了旧的 `src/main.rs`：

```rust
fn main() {
    println!("Hello, world!");
}
```

但它没有把默认 `kqode` 入口直接变成 JSON-RPC server。原因很简单：stdio JSON-RPC backend 会等待 stdin，它是给父进程驱动的。如果用户在终端里直接运行 `kqode`，进程不应该突然阻塞等待协议帧。默认入口保留 starter 文案，既不会误导用户，也不会让日常 `cargo run` 变成一个看似卡住的进程。

这个设计把两类使用者分开了：

- 人类运行 `kqode`：得到无害提示。
- TUI 或测试运行 `kqode --__kqode-json-rpc-backend`：得到协议 backend。

这正好符合 U4 的目标：证明 Rust backend 可以被前端进程驱动，但还不提前承诺最终 CLI 产品形态。
