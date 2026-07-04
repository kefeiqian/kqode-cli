---
sidebar_position: 4
title: 4. npm CI 发布流
---

平台包模型确定后，CI 的关键问题变成：什么时候发布、按什么顺序发布、用什么身份发布。相关变化分布在 [`37879221`](https://github.com/kefeiqian/KQode/commit/37879221)、[`40a32c53`](https://github.com/kefeiqian/KQode/commit/40a32c53) 和 [`42c0de14`](https://github.com/kefeiqian/KQode/commit/42c0de14)。最终形态落在 [`npm-publish.yml`](https://github.com/kefeiqian/KQode/blob/42c0de14/.github/workflows/npm-publish.yml)。

![Release workflow 完成后触发 npm publish workflow](../images/v0-1-3-npm-ci-publish/workflow-run-publish.png)

## 为什么 npm publish 不能和 release job 混在一起

npm 平台包必须从 GitHub Release archive 生成，所以发布顺序天然是：`release.yml` 在各平台 runner 上构建 archive；`release.yml` 上传 archive、`.sha256` 和 `checksums.txt` 到 GitHub Release；`npm-publish.yml` 下载刚发布的 archive；生成平台包；先发布平台包，再发布 launcher。

如果 npm publish 在 release job 中过早执行，就可能遇到 archive 还没上传、checksum 不完整、或者某个 required target 失败但 npm 已经部分发布的状态。v0.1.3 把 npm publish 放进单独 workflow，并让它在 Release workflow 成功完成后运行。

[`release.yml`](https://github.com/kefeiqian/KQode/blob/40a32c53/.github/workflows/release.yml) 顶部注释明确记录了这个分工：

```yml
# Authenticity controls: least-privilege permissions (only the release job gets
# `contents: write`), third-party actions pinned by version, build-provenance
# attestations, and published checksums. npm publishing is handled separately by
# npm-publish.yml, which runs automatically after this workflow completes (its
# workflow_run trigger) — kept separate so it stays a top-level workflow for npm
# Trusted Publishing. Homebrew/winget registration, signing, notarization, and
# auto-update are intentionally NOT performed here — see
# docs/release/kqode_distribution_registration.md.
```

## workflow_run：自动衔接，但保持 top-level 身份

[`npm-publish.yml`](https://github.com/kefeiqian/KQode/blob/42c0de14/.github/workflows/npm-publish.yml) 的触发器包含 `workflow_run`：

```yml
on:
  workflow_dispatch:
    inputs:
      tag:
        description: "Release tag to publish, e.g. v0.1.0"
        required: true
        type: string
  workflow_run:
    workflows: ["Release"]
    types: [completed]
  release:
    types: [published]
```

这比 `workflow_call` 更绕一点，但这是 npm Trusted Publishing 的关键 gotcha：npm OIDC 校验的是“正在运行的 top-level workflow 文件名”。如果 `release.yml` 通过 `workflow_call` 调用一个可复用 workflow 来执行 `npm publish`，npm 看到的 top-level workflow 仍然是 `release.yml`，而不是 npm 侧配置的 `npm-publish.yml`，发布会因为身份不匹配失败。

工作流注释把这个坑写得很直白：

```yml
# OIDC note: npm Trusted Publishing validates the TOP-LEVEL workflow's filename,
# NOT the file that runs `npm publish`. So this must stay a top-level workflow and
# must never be invoked via `workflow_call` from release.yml (npm would then
# validate it as `release.yml` and reject with ENEEDAUTH). workflow_run keeps the
# identity as `npm-publish.yml`, matching the configured Trusted Publisher with no
# npmjs.com change.
```

这个设计的 WHY 是供应链身份稳定性。CI YAML 结构可以重构，但 npm Trusted Publisher 配置是外部系统里的安全策略。为了让 OIDC identity 和 npm 配置一致，`npm-publish.yml` 必须作为被 GitHub Actions 直接调度的 top-level workflow 存在。

## checkout released commit：发布的是 tag 对应内容

workflow 通过 `head_sha` 或 tag checkout 发布时的提交：

```yml
- uses: actions/checkout@v4
  with:
    # Check out the exact released commit so the launcher package.json (its
    # version and platform-dependency pins) matches the released version.
    ref: ${{ github.event.workflow_run.head_sha || inputs.tag || github.event.release.tag_name || github.ref }}
```

为什么不直接 checkout 默认分支？因为 npm publish 是一个 release action，不是 latest-main action。tag `v0.1.3` 触发的包应该包含 `v0.1.3` 时刻的 `package.json`、generator 和 `SUPPORTED_TARGETS`。如果 workflow 在稍后的 main 上运行，平台包 pin、版本号或生成逻辑都可能已经变化。

## 先平台包，后 launcher

发布步骤里最重要的顺序是先 `dist-packages/*/`，再 `packaging/npm/kqode`：

```yml
# Platform packages first so the launcher's optionalDependencies resolve.
# Expect exactly one package per supported target (single source of truth).
expected="$(node -p "require('./packaging/npm/kqode/lib/resolve.cjs').SUPPORTED_TARGETS.length")"
published=0
for dir in dist-packages/*/; do
  ( cd "$dir" && publish_if_absent )
  published=$((published + 1))
done
[ "$published" -eq "$expected" ] || { echo "::error::expected $expected platform packages, generated $published"; exit 1; }

# Then the launcher (stamp its version for the dispatch/release paths;
# the checked-out commit already carries the matching dependency pins).
(
  cd packaging/npm/kqode
  npm version "$VERSION" --no-git-tag-version --allow-same-version >/dev/null
  publish_if_absent
)
```

这个顺序是由 npm 安装体验倒推出来的。用户安装 launcher 时，launcher 的 `optionalDependencies` 已经指向一组具体版本。如果 launcher 先发布，而平台包还没发布，早到的用户就会安装到一个依赖还不存在的版本。把平台包放前面，launcher 放最后，是让 public package graph 在任意时刻尽量保持可安装。

## 幂等发布：重复运行应该是 no-op

`publish_if_absent` 先查 registry，再决定是否 publish：

```yml
publish_if_absent() {
  local name ver
  name="$(node -p "require('./package.json').name")"
  ver="$(node -p "require('./package.json').version")"
  if npm view "$name@$ver" version >/dev/null 2>&1; then
    echo "$name@$ver already published; skipping."
  else
    npm publish --access public
    echo "published $name@$ver"
  fi
}
```

这个小函数对 release 工程非常重要。CI 可能因为网络、权限、GitHub UI 手动重跑而重复触发。npm package version 一旦发布不可覆盖，所以第二次运行不应该失败在“版本已存在”这种正常状态上。幂等逻辑让人工重跑成为安全操作。

## 数量校验也从 SUPPORTED_TARGETS 派生

[`42c0de14`](https://github.com/kefeiqian/KQode/commit/42c0de14) 的变化很小，但意义很大：

```yml
expected="$(node -p "require('./packaging/npm/kqode/lib/resolve.cjs').SUPPORTED_TARGETS.length")"
```

这让 CI 检查“生成了几个平台包”时不再手写 `5`。平台列表增长时，CI 自动期待更多包；生成器漏掉任何目标，CI 会 fail closed。这种小改动的价值在于减少 release day 的人脑同步成本。
