---
sidebar_position: 7
title: 7. Blog 和 README 链路修正
---

[`5b0bd712`](https://github.com/kefeiqian/KQode/commit/5b0bd712) 和 [`b66fb410`](https://github.com/kefeiqian/KQode/commit/b66fb410) 是 v0.1.3 里看起来比较小的两笔，但它们解决的是同一个问题：发布不只是 binary 和 npm 包，项目入口也必须指向正确位置。

![README 指向 GitHub Pages 开发日志](../images/v0-1-3-blog-readme/blog-entrypoint.png)

## GitHub Pages 的 baseUrl 是部署契约

Docusaurus 部署到 GitHub Pages 时，`url` 和 `baseUrl` 会进入静态资源路径、locale 路径和站内链接生成。仓库名如果从 `KQode` / 旧 URL 漂移到 `kqode-cli`，页面可能构建成功，但部署后 CSS、JS 或路由指向错误路径。

[`blog/docusaurus.config.ts`](https://github.com/kefeiqian/KQode/blob/5b0bd712/blog/docusaurus.config.ts) 在这次修正后写成：

```ts
const config: Config = {
  title: 'KQode',
  tagline: 'Build journal and project notes',

  url: 'https://kefeiqian.github.io',
  baseUrl: '/kqode-cli/',
  organizationName: 'kefeiqian',
  projectName: 'kqode-cli',
```

为什么这个配置值得单独记录？因为开发日志是 KQode 的用户和 contributor 入口。如果 release note、README badge 或 GitHub Pages URL 指到错误路径，读者会以为项目文档没有发布。对于一个公开构建的 coding-agent harness，文档站可访问性也是 release quality 的一部分。

## README 增加 Development blog

[`README.md`](https://github.com/kefeiqian/KQode/blob/b66fb410/README.md) 新增 development blog 章节：

```md
## Development blog

KQode is built in the open, and its documentation site doubles as a **development
blog** — an explanation of the build route and a running diary of the project as
it grows from a starter crate into a full coding-agent harness.

- Read it online: <https://kefeiqian.github.io/kqode-cli/>
- Available in 简体中文 (default) and English.
- Source lives under [`blog/`](blog/) and is published automatically by the
  GitHub Pages workflow.
```

这段 README 的 WHY 是降低进入成本。KQode 还处在 foundation stage，代码本身不能完整表达未来产品方向；真正解释“为什么这样拆 Rust core 和 TypeScript Ink TUI”、“为什么先做本地 terminal agent”、“为什么 release 工程要先闭环”的，是 docs 和 blog。把 blog 放进 README，就是把项目叙事从仓库首页接上。

## URL 修正和 npm 发布是同一类问题

表面上，GitHub Pages `baseUrl` 和 npm 平台包没有关系；实际上它们都属于“发布后的消费者路径”。npm 用户需要 `@kqode/kqode-cli` 能解析到正确 binary；文档读者需要 README 能跳到正确站点。二者共同的判断标准不是“本地构建能过”，而是“发布后外部用户按入口访问时不踩坑”。

这也是为什么这篇选择把 blog 修正独立出来。v0.1.3 的中心是分发模型，但 release correctness 还包含项目主页、badge、repo URL、文档站路径这些边缘入口。它们一旦错了，用户感受到的仍然是“这个 release 不完整”。
