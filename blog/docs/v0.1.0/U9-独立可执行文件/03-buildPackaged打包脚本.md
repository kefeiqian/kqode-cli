---
sidebar_position: 3
title: 3. buildPackaged 打包脚本
---

U9 新增 [`tui/scripts/buildPackaged.ts`](https://github.com/kefeiqian/KQode/blob/f642fb3b65bad29da3497d77967af741424205ca/tui/scripts/buildPackaged.ts)。它 staging 已构建的 Rust backend、计算 SHA-256，然后调用 `Bun.build({ compile })`。

```ts
function stageBackend(backendSource: string): { stagedPath: string; sha256: string } {
  if (!fs.existsSync(backendSource)) {
    throw new Error(
      `Rust backend not found at ${backendSource}; build it with \`cargo build --release --bin kqode\` or pass --backend=<path>`
    );
  }
  const assetsDir = path.join(tuiRoot, 'packaged', 'assets');
  fs.mkdirSync(assetsDir, { recursive: true });
  const stagedPath = path.join(assetsDir, 'kqode-backend');
  fs.copyFileSync(backendSource, stagedPath);

  const sha256 = createHash('sha256').update(fs.readFileSync(stagedPath)).digest('hex');
  return { stagedPath, sha256 };
}
```

![buildPackaged staging Rust backend 并编译 executable](../../images/u9-standalone-executable/build-packaged-flow.png)

脚本刻意不自己编译 Rust。Rust release build 由 `cargo xtask package` 负责，Bun script 只负责 packaging。这样 Rust workspace 细节留在 Cargo 侧，TypeScript dependency closure 和 executable 输出留在 Bun 侧，两边通过 `--backend=<path>` 或默认 `target/release/kqode[.exe]` 交接。

```ts
const result = await Bun.build({
  entrypoints: [entry],
  minify: true,
  define: {
    __PROD__: 'true',
    __TEST__: 'false',
    __DEV__: 'false',
    ['process.env.' + VERSION_ENV_VAR]: JSON.stringify(version),
    ['process.env.' + BACKEND_SHA256_ENV_VAR]: JSON.stringify(sha256)
  },
  plugins: [stubReactDevtools],
  compile: { outfile: outBase }
});
```

`__PROD__` 让 `bootstrap.ts` 选择 packaged branch；version 和 digest 被 inline 到 executable 里，运行时用来选择 cache 目录和验证 backend。U9 选择 Bun compile，而不是 Rollup + Node SEA + `postject`，是为了减少打包链路的移动部件：同一个工具负责前端 bundle 和 native executable 输出。
