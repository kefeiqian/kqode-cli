---
sidebar_position: 4
title: 4. set-version 锁步升级 manifest
---

[`9af3d5f0`](https://github.com/kefeiqian/KQode/commit/9af3d5f0e4638b37463f09eb7a4edfa7411775ca) 新增了一个很小但很关键的自动化命令：

```bash
cargo xtask set-version X.Y.Z
```

它的职责是把 KQode 的所有版本字段锁步改成同一个值，并刷新 `Cargo.lock`。这个命令是后续 release workflow 的基础，因为 KQode 不只有一个 manifest。

![set-version 同步多个 manifest](../images/v0-1-1-set-version/manifest-lockstep.png)

## 为什么必须锁步

到 `v0.1.1` 时，KQode 至少有四个地方携带产品版本：

- 根目录 `Cargo.toml`：Rust package 的版本，也是 source mode 读取产品版本的来源。
- `xtask/Cargo.toml`：workspace 内的自动化 crate 版本。
- `tui/package.json`：TypeScript Ink TUI package 版本。
- `packaging/npm/kqode/package.json`：npm launcher package 版本。

如果这些版本号不一致，就会出现非常糟糕的发布体验：Git tag 是 `v0.1.1`，Rust binary 显示 `0.1.0`，npm package 又发布成另一个版本。用户不关心这是哪个 manifest 漏改，他们只会看到 KQode 自己说法不一致。

所以这个命令的设计原则是：**不要让人手动记住要改哪些文件。**

## 命令入口保持很薄

新增的 [`xtask/src/commands/set_version.rs`](https://github.com/kefeiqian/KQode/blob/9af3d5f0e4638b37463f09eb7a4edfa7411775ca/xtask/src/commands/set_version.rs) 只做命令解析和委托：

```rust
pub const COMMAND: CommandSpec = CommandSpec {
    name: "set-version",
    description: "Set the product version across all manifests and Cargo.lock (usage: set-version <X.Y.Z>)",
    run,
};
```

真正的参数读取也很少：

```rust
pub fn run(repo_root: &Path) -> Result<(), String> {
    let version = std::env::args()
        .nth(2)
        .ok_or_else(|| "usage: cargo xtask set-version <MAJOR.MINOR.PATCH>".to_string())?;
    version::set_all(repo_root, &version)
}
```

这里符合 KQode 对 `xtask` 的约定：command module 是 thin wrapper，复杂逻辑放到 support module。这样以后 release automation、skill 或 IDE profile 都调用同一个实现，不会各自复制版本替换代码。

## 哪些 manifest 被改

核心逻辑在 [`xtask/src/support/version.rs`](https://github.com/kefeiqian/KQode/blob/9af3d5f0e4638b37463f09eb7a4edfa7411775ca/xtask/src/support/version.rs)：

```rust
/// Cargo manifests carrying the product version, bumped together by `set-version`.
const TOML_MANIFESTS: &[&str] = &["Cargo.toml", "xtask/Cargo.toml"];

/// npm package manifests carrying the product version.
const JSON_MANIFESTS: &[&str] = &["packaging/npm/kqode/package.json", "tui/package.json"];
```

`set_all()` 先校验版本，再改 TOML 和 JSON，最后刷新 lockfile：

```rust
pub fn set_all(repo_root: &Path, version: &str) -> Result<(), String> {
    validate(version)?;

    for rel in TOML_MANIFESTS {
        rewrite(repo_root, rel, version, set_toml_version)?;
    }
    for rel in JSON_MANIFESTS {
        rewrite(repo_root, rel, version, set_json_version)?;
    }

    cargo::update_workspace_lock(repo_root)?;
    println!("refreshed Cargo.lock");
    Ok(())
}
```

这个顺序也有意图：先保证输入合法，再写所有 manifest，最后让 Cargo 重新计算 workspace lock。否则 `Cargo.lock` 里 workspace member 的 version 可能还停留在旧值。

## 为什么不用完整 TOML / JSON parser

这个 helper 没有引入依赖，而是用很窄的文本替换。原因是要改的字段非常明确：顶层 `version`。引入 parser 会带来更多依赖和格式化副作用，而这里只需要最小、可测试的替换。

TOML 只替换 column 0 的 `version =`，避免误伤 dependency inline version：

```rust
fn is_toml_version_line(line: &str) -> bool {
    line.strip_prefix("version")
        .is_some_and(|rest| rest.trim_start().starts_with('='))
}
```

JSON 则替换第一个顶层 `"version"` 行，并尽量保留缩进和 trailing comma：

```rust
fn replace_json_value(line: &str, version: &str) -> String {
    let Some(colon) = line.find(':') else {
        return line.to_string();
    };
    let (head, tail) = line.split_at(colon + 1);
    let Some(open) = tail.find('"') else {
        return line.to_string();
    };
```

这种实现不是通用配置编辑器，但它很适合当前任务：少依赖、少格式漂移、行为可测试。

## 版本校验为什么拒绝 `v1.2.3`

`validate()` 接受 `MAJOR.MINOR.PATCH`，也允许 pre-release 或 build suffix，但不接受带 `v` 的 tag 字符串：

```rust
fn validate(version: &str) -> Result<(), String> {
    let core = version.split(['-', '+']).next().unwrap_or_default();
    let parts: Vec<&str> = core.split('.').collect();
    let numeric = parts.len() == 3
        && parts
            .iter()
            .all(|part| !part.is_empty() && part.bytes().all(|byte| byte.is_ascii_digit()));
    if numeric {
        Ok(())
    } else {
        Err(format!("`{version}` is not a MAJOR.MINOR.PATCH version"))
    }
}
```

这是 release 语义的区分：manifest 里是 `0.1.1`，Git tag 才是 `v0.1.1`。把 `v` 写进 manifest 会污染 package metadata，也会让 npm 和 Cargo 的版本规则失效。

## IDE 入口也同步

commit 还新增了 [`.run/xtask_set-version.run.xml`](https://github.com/kefeiqian/KQode/blob/9af3d5f0e4638b37463f09eb7a4edfa7411775ca/.run/xtask_set-version.run.xml)，让 IDE 里也能看到同一个命令：

```xml
<configuration default="false" name="xtask: set-version" type="CargoCommandRunConfiguration" factoryName="Cargo Command">
  <option name="command" value="run -p xtask -- set-version" />
  <option name="workingDirectory" value="$PROJECT_DIR$" />
  <method v="2" />
</configuration>
```

这不是为了鼓励手点发布，而是保持规则一致：文档、IDE、Agent skill 和人工命令行都应该走 `cargo xtask set-version`。
