---
sidebar_position: 3
title: 3. version-bump 技能自动化发布交接
---

v0.1.2 的另一个改动来自 commit [`3338b53016a8dc1662bf97a2459ee3f46961526f`](https://github.com/kefeiqian/KQode/commit/3338b53016a8dc1662bf97a2459ee3f46961526f)。它没有改产品 runtime，而是改了内部 [`kqode-version-bump` skill](https://github.com/kefeiqian/KQode/blob/3338b53016a8dc1662bf97a2459ee3f46961526f/.agents/skills/kqode-version-bump/SKILL.md)：版本提升之后，技能现在会自动创建 release commit 和 tag，然后再分别询问是否 push、是否发布 npm。

这是一类非常适合交给 agent 技能的流程：步骤固定、容易忘、顺序重要，而且一旦错了会影响公开发布物。

![version-bump 技能发布流程](../images/v0-1-2-version-bump/release-flow.png)

## 原来的问题：只 bump 版本还不够

在这个 commit 之前，`kqode-version-bump` 的描述是“选择版本并运行 `cargo xtask set-version`”。成功后，它会提醒维护者自己去 commit、tag 和 push。diff 里可以看到旧 section 标题是：

```diff
-### 4. Remind about commit and tag
```

这种设计在早期足够，因为最重要的是确保所有 manifest 由同一个命令改，不要手动编辑。但是进入正式发布流程后，“提醒”仍然把关键状态留给人类：

- 人类可能忘记 commit，导致 tag 指向的内容不是版本 bump 后的内容。
- 人类可能打错 tag，导致 `kqode --version`、GitHub Release 和 npm version 不一致。
- 人类可能只 push commit、不 push tag，导致 release workflow 没有触发。
- 人类可能在 release assets 还没上传之前发布 npm，导致 npm postinstall 找不到对应 tag 的 archive。

所以这次改动的目标不是把所有事情无脑自动化，而是重新划分“本地确定性步骤”和“远端有副作用步骤”。

## 技能描述直接写明端到端流程

commit 首先更新了 frontmatter description。新的描述把范围从“bump version”扩展为完整 release handoff：

```diff
-description: "Interactively bump the KQode product version. Use when asked to bump/release a new version, cut a release, or change the version number. Shows the current version, asks whether to bump major/minor/patch (or a custom version), then runs `cargo xtask set-version` to update every manifest in lockstep."
+description: "Interactively bump the KQode product version. Use when asked to bump/release a new version, cut a release, or change the version number. Shows the current version, asks whether to bump major/minor/patch (or a custom version), runs `cargo xtask set-version` to update every manifest in lockstep, commits and tags the release, then offers to push (triggering the release pipeline) and publish to npm, and prints the GitHub Release and npm links."
```

这不是纯文案。对 agent skill 来说，description 是触发和行为边界的一部分。把“commit and tag”、“push”、“publish to npm”都写进描述，可以减少未来 agent 在发布任务里只执行前半段的概率。

## 自动 commit 和 tag：因为它们是本地一致性的一部分

新的第 4 步标题改为：

```md
### 4. Commit and tag the release (automatic)
```

对应正文明确说：版本必须等于 release tag，所以 bump 成功后应该自动创建二者，不需要再额外确认本地 commit 和 tag。

````md
The version must equal the release tag, so create both automatically after a
successful bump — no confirmation needed for the local commit and tag. First
make sure the working tree contains only the bump's changes, then commit and
tag:

```bash
git commit -am "chore: release v<chosen-version>"
git tag v<chosen-version>
```
````

这里的取舍是：本地 commit 和本地 tag 会改变 Git 状态，但还没有把内容发布到远端；它们是版本 bump 的自然收尾。如果 skill 已经被明确要求 release 一个版本，那么让它生成 `chore: release v<chosen-version>` 和 `v<chosen-version>` tag，比让人手动复制命令更安全。

同时，技能要求“先确认 working tree 只有 bump 的变化”。这个约束很重要：自动 commit 如果把无关修改一起打进 release commit，会污染发布历史。把检查写进 skill，等于告诉 agent：自动化不代表跳过 Git hygiene。

另一个安全阀是已有 tag：

```md
If the tag `v<chosen-version>` already exists, stop and report it instead of
moving it.
```

release tag 是不可变发布坐标。移动 tag 会让已经下载过的用户、GitHub Release assets、npm postinstall 逻辑和审计记录全部变得不可信，所以这里选择 fail closed。

## push 仍然需要确认：因为它触发远端发布流水线

新的第 5 步要求使用 `ask_user`：

````md
Use the ask_user tool: "Push the release commit and tag `v<chosen-version>` now
to trigger the release pipeline?" Do not push without explicit confirmation. If
the user declines, print the commands below and stop.

```bash
git push origin HEAD
git push origin v<chosen-version>
```
````

为什么不自动 push？因为 push tag 是外部副作用。它会触发 `release.yml`，开始构建 standalone executables，创建或更新 GitHub Release，并上传 archives 和 checksums。这个动作一旦发生，维护者面对的就不只是本地 Git 历史，而是公开发布流程。

所以新的边界是：**本地 release commit 和 tag 自动做，远端发布触发必须确认。** 这比“所有步骤都人工”更可靠，也比“所有步骤都自动”更安全。

## npm 发布拆成单独确认步骤

commit 新增的第 6 步专门解释 npm：

```md
`release.yml` does NOT publish to npm, and a GitHub Release created by its
`GITHUB_TOKEN` does not re-fire the `release: published` event — so npm keeps
serving the old version until `npm-publish.yml` runs. Because the npm package's
postinstall downloads the tag's release archive, publish to npm only AFTER
`release.yml` has finished uploading that tag's assets.
```

这段话把一个容易误解的发布事实写进了 skill：GitHub Release workflow 和 npm publish workflow 不是自动串起来的。尤其是 GitHub Actions 使用 `GITHUB_TOKEN` 创建 release 时，不会再次触发某些 release 事件。也就是说，只 push tag 还不等于 npm 已经更新。

而 npm 包的安装逻辑依赖对应 tag 的 release archive。用户 `npm install -g @kqode/kqode-cli` 后，postinstall 会去下载 release assets。如果 npm 先发布、release assets 还没准备好，用户就会安装失败。这个顺序约束不能只靠维护者记忆，所以 skill 明确要求：`release.yml` 成功后，再确认并 dispatch `npm-publish.yml`。

```bash
gh workflow run npm-publish.yml -f tag=v<chosen-version>
gh run watch <run-id> --exit-status
```

这里还强调 “OIDC Trusted Publishing — no token” 和 “never `npm publish` by hand”。原因是发布凭据和审计路径都应该留在 GitHub Actions，而不是散落在本地机器。

## 最后输出链接，方便验证发布结果

新的第 7 步要求展示 GitHub Release URL 和 npm package URL：

```bash
gh release view v<chosen-version> --json url -q .url
# npm: https://www.npmjs.com/package/@kqode/kqode-cli/v/<chosen-version>
```

这一步看似只是体验优化，实际是发布闭环的一部分。release 不是命令跑完就结束，而是要让维护者拿到可点击、可验证、可分享的结果。对于后续自动化来说，这些链接也可以成为 release note、PR comment 或审计日志的一部分。

## 最终规则变化

commit 最后调整了 Rules：

```diff
 - Never hand-edit version fields; always go through `cargo xtask set-version`.
 - Show the current version and the concrete resulting version for every choice.
 - Do not choose the bump type for the user; ask and wait.
+- Create the release commit and tag automatically, but never push or publish to
+  npm without explicit user confirmation.
 - Keep the git tag equal to the new version (`v<version>`), or `kqode --version`
   will not match the published npm/release version.
-- Do not create the tag or push without explicit user confirmation.
+- Publish npm only after `release.yml` has uploaded the tag's archives, and only
+  via `npm-publish.yml` (never `npm publish` by hand). See
+  `docs/release/kqode_distribution_registration.md`.
```

这就是 v0.1.2 的 release philosophy：把可机械执行、可本地验证的步骤交给 skill；把会公开发布或触发远端流水线的步骤留给明确确认；把顺序约束写进文档，让 agent 和人类都按同一套发布协议工作。
