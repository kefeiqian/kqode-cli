---
sidebar_position: 5
title: 5. 版本升级 skill 与作者工作流
---

[`4aefb513`](https://github.com/kefeiqian/KQode/commit/4aefb51328cdee9b60f784c3997f194861a18182) 更新了 `.agents/skills` 下的作者工作流，并新增 `kqode-version-bump` skill。它和上一篇的 `set-version` 命令是一组：`xtask` 负责真实写文件，skill 负责把交互流程和 release 约束讲清楚。

![version-bump skill 调用 set-version](../images/v0-1-1-version-bump-skill/version-bump-flow.png)

## 为什么需要 skill，而不是只要命令

`cargo xtask set-version 0.1.1` 解决的是“怎么写文件”。但发布时还有几个容易出错的步骤：

- 当前版本是多少？
- patch / minor / major 分别会变成多少？
- 用户是否真的要 bump 这个版本？
- bump 完后是否需要 tag？
- tag 名是否必须等于 `v<version>`？

这些问题不适合塞进 `set-version`。`set-version` 应该保持确定性：给定版本，修改 manifest。而交互、提醒和下一步建议更适合放在 Agent skill 里。

## 新增 `kqode-version-bump`

新增的 [`.agents/skills/kqode-version-bump/SKILL.md`](https://github.com/kefeiqian/KQode/blob/4aefb51328cdee9b60f784c3997f194861a18182/.agents/skills/kqode-version-bump/SKILL.md) 开头就把职责边界写清楚：

```md
Interactively raise the KQode product version. This skill only chooses the new
version and delegates the actual writes to `cargo xtask set-version`, which is the
single source of truth for which files change (root `Cargo.toml`,
`xtask/Cargo.toml`, `packaging/npm/kqode/package.json`, `tui/package.json`, and
`Cargo.lock`). Do not hand-edit version fields.
```

这个设计的关键是 “delegates”。skill 不自己改 `Cargo.toml`，也不自己改 `package.json`。它只帮助用户选择版本，然后调用唯一写入口：

````md
Run the xtask command with the chosen version:

```bash
cargo xtask set-version <chosen-version>
```
````

这样未来如果 manifest 列表改变，只需要改 `xtask` 的 `set_all()`，skill 仍然调用同一个命令。

## 版本候选由脚本计算

skill 没有让 Agent 自己解析版本号，而是新增 [`.agents/skills/kqode-version-bump/scripts/version_options.py`](https://github.com/kefeiqian/KQode/blob/4aefb51328cdee9b60f784c3997f194861a18182/.agents/skills/kqode-version-bump/scripts/version_options.py)：

```py
def bump_candidates(version: str) -> dict[str, str]:
    match = SEMVER_CORE.match(version)
    if match is None:
        raise SystemExit(f"error: `{version}` is not a MAJOR.MINOR.PATCH version")
    major, minor, patch = (int(part) for part in match.groups())
    return {
        "major": f"{major + 1}.0.0",
        "minor": f"{major}.{minor + 1}.0",
        "patch": f"{major}.{minor}.{patch + 1}",
    }
```

为什么要用脚本？因为版本 bump 是一个看似简单、但不应该靠模型心算的流程。脚本把当前版本、major、minor、patch 候选输出成 JSON，Agent 只负责展示和询问。这样可以减少“模型算错版本号”这种低级但代价很高的问题。

脚本读取根目录 `Cargo.toml` 的顶层版本：

```py
def read_current_version(root: Path) -> str:
    manifest = (root / "Cargo.toml").read_text(encoding="utf-8")
    match = TOP_LEVEL_VERSION.search(manifest)
    if match is None:
        raise SystemExit("error: no top-level `version = \"...\"` in Cargo.toml")
    return match.group(1)
```

这也和 `set-version` 的约定一致：根目录 `Cargo.toml` 是产品版本的 source of truth。

## 发布后的提醒也写进流程

skill 最后提醒 commit 和 tag：

```md
git commit -am "chore: release v<chosen-version>"
git tag v<chosen-version> && git push origin v<chosen-version>
```

但它同时规定不要在没有用户确认时创建 tag 或 push。这是一个很重要的安全边界。版本号写入是工作区修改；tag 和 push 是发布动作，会影响远端和自动化 workflow。skill 把下一步写清楚，但保留人为确认。

## 作者工作流也被加强

这个 commit 还更新了 blog 新文章 skill。[`.agents/skills/kqode-blog-new-article/SKILL.md`](https://github.com/kefeiqian/KQode/blob/4aefb51328cdee9b60f784c3997f194861a18182/.agents/skills/kqode-blog-new-article/SKILL.md) 新增了不可变链接要求：

```md
When the article mentions or quotes a project source file or checked-in config file, read that file from the article's pinned commit and link the path to the same immutable GitHub commit permalink, not the moving `main` branch or current working tree.
```

这个要求正好服务本系列文章：我们记录的是 `v0.1.1` 当时的代码，不是未来 `main` 的代码。开发日志最怕 drift；链接到 `main` 会让读者半年后看到一段和文章描述不一致的代码。

同一 commit 还新增了 [`.agents/skills/kqode-new-xtask/SKILL.md`](https://github.com/kefeiqian/KQode/blob/4aefb51328cdee9b60f784c3997f194861a18182/.agents/skills/kqode-new-xtask/SKILL.md)，把新增 `xtask` 命令的规则固化下来：

```md
4. Implement the command as a thin wrapper under `xtask/src/commands/<group>/` when possible.
5. Put reusable or non-trivial implementation logic in `xtask/src/support/` or another shared module instead of the command wrapper.
6. Register the command with a `CommandSpec`, include it in the group's `COMMANDS`, and ensure `cargo xtask help` will list it.
```

这和 `set-version` 的实际实现互相呼应：命令入口薄、可复用逻辑进 support、IDE profile 同步。换句话说，`v0.1.1` 不只是加了一个命令，还把“以后如何加命令”写成了 Agent 可执行的流程。

## 为什么这是 release 工程的一部分

很多项目把 release 看成最后一步：改版本号、打 tag、发包。但对 coding-agent harness 来说，release 过程本身也应该可追踪、可复现、可交给 Agent 执行。`kqode-version-bump` 的意义就在这里：它把人类容易忘的约束转成了 workflow，把真正危险的写操作收口到 `xtask`，把发布动作保留给用户确认。
