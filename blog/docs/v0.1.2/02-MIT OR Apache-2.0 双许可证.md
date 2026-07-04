---
sidebar_position: 2
title: 2. MIT OR Apache-2.0 双许可证
---

v0.1.2 的第一个实质改动，是在 commit [`4ac3aed7eae5623858d578fdd215acf83cdbe29c`](https://github.com/kefeiqian/KQode/commit/4ac3aed7eae5623858d578fdd215acf83cdbe29c) 里把 KQode 改成 `MIT OR Apache-2.0` 双许可证。

这个改动不只是“仓库根目录多两个 LICENSE 文件”。它同时覆盖了 root Rust package、`xtask` crate、TypeScript TUI package、npm 分发包、README，以及 npm tarball 的文件 allowlist。原因很简单：许可证必须出现在人类会读的位置，也必须出现在工具链和分发渠道会读的位置。

![MIT OR Apache-2.0 双许可证结构](../images/v0-1-2-dual-license/license-structure.png)

## 为什么选择 MIT OR Apache-2.0

KQode 是 Rust-first 项目，选择 `MIT OR Apache-2.0` 有很强的生态惯性。Rust 本身和大量 Rust crate 都采用这个组合。对使用者来说，这意味着他们可以按自己的项目约束在 MIT 和 Apache-2.0 之间二选一，而不是被迫同时满足两个许可证。

这里的 `OR` 很重要。`MIT OR Apache-2.0` 不是“必须同时遵守 MIT 和 Apache-2.0”，而是“任选其一”。这让依赖集成更灵活：如果调用方的项目更熟悉 MIT，可以按 MIT 使用；如果组织需要 Apache-2.0 的专利授权条款，也可以按 Apache-2.0 使用。

为什么不只用 MIT？MIT 非常短、兼容性好、采用广泛，但它不包含 Apache-2.0 那样明确的专利授权和专利终止条款。对于 coding-agent harness 这种可能涉及工具执行、协议适配、发布渠道和未来 provider 集成的基础设施项目，Apache-2.0 的专利 grant 能给企业和长期维护者更多确定性。

为什么不只用 Apache-2.0？Apache-2.0 条款更完整，但也更长，某些生态或项目模板更偏好 MIT 的简单 permissive 模型。双许可证把两者合在一起：保持 permissive 兼容性，同时给需要专利条款的使用者一个正式选项。

## Cargo manifest 中声明 license

commit 的 diff 在 root [`Cargo.toml`](https://github.com/kefeiqian/KQode/blob/4ac3aed7eae5623858d578fdd215acf83cdbe29c/Cargo.toml) 里新增了 `license` 字段：

```diff
 [package]
 name = "KQode"
 version = "0.1.1"
 edition = "2024"
+license = "MIT OR Apache-2.0"
```

`xtask` crate 的 [`xtask/Cargo.toml`](https://github.com/kefeiqian/KQode/blob/4ac3aed7eae5623858d578fdd215acf83cdbe29c/xtask/Cargo.toml) 也同步声明：

```diff
 [package]
 name = "xtask"
 version = "0.1.1"
 edition = "2024"
+license = "MIT OR Apache-2.0"
```

这里不是为了让 `xtask` 单独发布到 crates.io，而是为了让 workspace 里的 Rust crate 元数据保持一致。`xtask` 虽然是内部自动化入口，但它仍然是 checked-in Rust crate；以后如果自动化代码被复用、审计或打包，license metadata 不应该缺失。

## npm package 也要带上 license 和正文

KQode 同时有 TypeScript Ink TUI 和 npm CLI 分发包。commit 在 [`tui/package.json`](https://github.com/kefeiqian/KQode/blob/4ac3aed7eae5623858d578fdd215acf83cdbe29c/tui/package.json) 中加入：

```diff
 {
   "name": "@kqode/tui",
   "version": "0.1.1",
+  "license": "MIT OR Apache-2.0",
   "private": true,
```

更关键的是 npm 分发包 [`packaging/npm/kqode/package.json`](https://github.com/kefeiqian/KQode/blob/4ac3aed7eae5623858d578fdd215acf83cdbe29c/packaging/npm/kqode/package.json)。它不仅声明 `license`，还把两份许可证文件加入 `files` allowlist：

```diff
 {
   "name": "@kqode/kqode-cli",
   "version": "0.1.1",
   "description": "KQode — a Rust-core coding-agent harness with a TypeScript Ink terminal UI.",
+  "license": "MIT OR Apache-2.0",
@@
   "files": [
     "bin/",
     "lib/",
+    "LICENSE-APACHE",
+    "LICENSE-MIT",
     "README.md"
   ],
```

这个细节很容易漏。npm package 的 `files` 是 allowlist；如果只在仓库根目录添加 `LICENSE-MIT` 和 `LICENSE-APACHE`，但没有把对应文件复制到 package 目录并加入 allowlist，最终发布到 npm 的 tarball 里可能看不到许可证正文。对用户来说，安装包才是他们实际拿到的 artifact，所以 package 内也必须自包含许可证文本。

## LICENSE 文件里的真实文本

commit 新增的 root [`LICENSE-MIT`](https://github.com/kefeiqian/KQode/blob/4ac3aed7eae5623858d578fdd215acf83cdbe29c/LICENSE-MIT) 开头是标准 MIT 文本，并标注版权年份和作者：

```text
MIT License

Copyright (c) 2026 Kefei Qian

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:
```

root [`LICENSE-APACHE`](https://github.com/kefeiqian/KQode/blob/4ac3aed7eae5623858d578fdd215acf83cdbe29c/LICENSE-APACHE) 则是 Apache License 2.0 正文：

```text
Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

   1. Definitions.
```

npm package 目录下也新增了对应的 [`packaging/npm/kqode/LICENSE-MIT`](https://github.com/kefeiqian/KQode/blob/4ac3aed7eae5623858d578fdd215acf83cdbe29c/packaging/npm/kqode/LICENSE-MIT) 和 [`packaging/npm/kqode/LICENSE-APACHE`](https://github.com/kefeiqian/KQode/blob/4ac3aed7eae5623858d578fdd215acf83cdbe29c/packaging/npm/kqode/LICENSE-APACHE)。这让源码仓库和 npm tarball 的法律文本保持一致。

## README 给人类读，manifest 给工具读

commit 还在 [`README.md`](https://github.com/kefeiqian/KQode/blob/4ac3aed7eae5623858d578fdd215acf83cdbe29c/README.md) 末尾新增 License section：

```md
## License

KQode is dual-licensed under either of:

- Apache License, Version 2.0 ([`LICENSE-APACHE`](LICENSE-APACHE) or
  <https://www.apache.org/licenses/LICENSE-2.0>)
- MIT license ([`LICENSE-MIT`](LICENSE-MIT) or
  <https://opensource.org/licenses/MIT>)

at your option.

Unless you explicitly state otherwise, any contribution intentionally submitted
for inclusion in KQode by you, as defined in the Apache-2.0 license, shall be
dual-licensed as above, without any additional terms or conditions.
```

这段 README 文本补了两个语义：第一，使用者可以任选 Apache-2.0 或 MIT；第二，贡献者如果没有额外声明，提交给 KQode 的贡献也按同样的双许可证进入项目。后者对长期维护尤其重要，因为项目未来如果接受外部贡献，就需要避免“代码是双许可证，但某个贡献没有授权清楚”的灰区。

## 这个改动暂时没有做什么

这个 commit 没有引入 `NOTICE` 文件，也没有添加复杂的 contributor license agreement 流程。原因是 KQode 目前还处在早期项目阶段，先采用 Rust 生态常见的 permissive 双许可证即可满足开放使用和分发需求。等项目未来引入第三方代码复制、品牌素材、生成资产或更复杂的治理流程时，再按实际需要补 `NOTICE` 或贡献协议会更合适。
