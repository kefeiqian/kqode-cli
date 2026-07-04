---
sidebar_position: 2
title: 2. Release 工作流详解
---

U13 的 [`release.yml`](https://github.com/kefeiqian/KQode/blob/a1953dbddf0b1902e8dfe46220e7aeb33cf829cb/.github/workflows/release.yml) 把 U12 的 `cargo xtask package-release` 放进 GitHub Actions matrix。每个 target 在 native runner 上构建自己的 archive 和 `.sha256`，最后由 release job 汇总、校验、attest 并上传。

## 构建矩阵

```yaml
strategy:
  fail-fast: false
  matrix:
    include:
      - { target: kqode-darwin-arm64,  runner: macos-14,         archive: kqode-darwin-arm64.tar.gz,  required: true }
      - { target: kqode-linux-x64,     runner: ubuntu-22.04,     archive: kqode-linux-x64.tar.gz,     required: true }
      - { target: kqode-linux-arm64,   runner: ubuntu-22.04-arm, archive: kqode-linux-arm64.tar.gz,   required: true }
      - { target: kqode-windows-x64,   runner: windows-2022,     archive: kqode-windows-x64.zip,      required: true }
      - { target: kqode-windows-arm64, runner: windows-11-arm,   archive: kqode-windows-arm64.zip,    required: false }
```

这里延续 U12 的目标命名。`fail-fast: false` 很重要：如果一个平台失败，其他平台仍然继续构建，release job 最后再统一判断 required target 是否齐全。这样可以一次看到多个平台的状态，而不是第一个失败就终止。

Windows ARM64 被标为 optional：

```yaml
continue-on-error: ${{ !matrix.required }}
```

原因和 U12 一致：native Windows ARM64 仍属于 best-effort。它不应该阻塞 `v0.1.0` 的 required release，但如果构建成功，也可以被纳入 artifacts。

## 为什么 release job 要 fail closed

release job 先下载所有 build artifacts，然后显式检查 required target：

```bash
for t in $REQUIRED_TARGETS; do
  case "$t" in *windows*) ext=zip ;; *) ext=tar.gz ;; esac
  [ -f "$t.$ext" ]   || { echo "::error::missing required archive $t.$ext"; fail=1; }
  [ -f "$t.sha256" ] || { echo "::error::missing required checksum $t.sha256"; fail=1; }
done
```

这一步的设计目标是 fail closed。因为 `needs: build` 加上 optional target 和 artifact download，最危险的失败模式不是 workflow 红掉，而是少上传一个 required target 但 release 仍然生成。显式 manifest check 可以避免“看似成功、实则缺包”的发布。

接着它校验 checksum，并生成 aggregate manifest：

```bash
if ! sha256sum -c *.sha256; then
  echo "::error::checksum verification failed"
  exit 1
fi

cat *.sha256 | sort -k2 > checksums.txt
```

## 为什么只在 tag push 上创建 Release

`workflow_dispatch` 是 dry run：它构建并上传 workflow artifacts，但不创建 GitHub Release。真正发布只发生在 `refs/tags/v*`：

```yaml
- name: Create or update GitHub Release (idempotent)
  if: ${{ github.event_name == 'push' && startsWith(github.ref, 'refs/tags/v') }}
```

这样维护者可以手动跑 workflow 验证打包链路，而不会误发 release。只有推送版本 tag 才进入公开发布路径。

## 为什么需要 attestation 和最小权限

workflow 顶层默认 `contents: read`，只有 release job 申请 `contents: write`、`id-token: write`、`attestations: write`：

```yaml
permissions:
  contents: read
```

```yaml
permissions:
  contents: write # create/update the GitHub Release
  id-token: write # build-provenance attestation
  attestations: write # build-provenance attestation
```

这是供应链安全的基本姿态：构建 job 不需要写 release，就不给写权限；只有发布 job 需要写。Attestation 则让用户可以用 `gh attestation verify` 验证 artifact provenance。U13 没有做签名和公证，但已经把 checksum + provenance 的基础放进 release pipeline。

## npm 发布为什么单独 workflow

[`npm-publish.yml`](https://github.com/kefeiqian/KQode/blob/a1953dbddf0b1902e8dfe46220e7aeb33cf829cb/.github/workflows/npm-publish.yml) 使用 npm Trusted Publishing：

```yaml
permissions:
  contents: read
  id-token: write # OIDC token for npm Trusted Publishing
```

发布步骤会从 tag 解析版本，先检查该版本是否已经存在，再决定是否 `npm publish`：

```bash
npm version "$VERSION" --no-git-tag-version --allow-same-version >/dev/null
name="$(node -p "require('./package.json').name")"
if npm view "$name@$VERSION" version >/dev/null 2>&1; then
  echo "$name@$VERSION already published; skipping."
else
  npm publish --access public
fi
```

它不依赖 `NPM_TOKEN`，而是让 npm 根据 GitHub OIDC 身份确认 workflow 是否有发布权限。U13 还在注释里说明：由 `GITHUB_TOKEN` 创建的 Release 不会可靠触发 `release: published` 事件，所以手动 dispatch 是推荐路径。这是一个务实选择，避免把 release 成功与 npm 自动触发绑死在 GitHub 事件细节上。
