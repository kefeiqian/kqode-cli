---
sidebar_position: 4
title: 4. npm 薄安装器
---

U12 新增 `@kqode/kqode-cli` npm package。它的核心设计是：npm 包本身不携带平台 binary，而是在安装或首次运行时从 GitHub Release 下载对应 archive。

[`package.json`](https://github.com/kefeiqian/KQode/blob/a667e95e4ba1832be0b94fb4fb027cae2f5438ad/packaging/npm/kqode/package.json) 定义了命令入口和 postinstall：

```json
{
  "name": "@kqode/kqode-cli",
  "version": "0.1.0",
  "description": "KQode — a Rust-core coding-agent harness with a TypeScript Ink terminal UI.",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/kefeiqian/kqode-cli.git"
  },
  "homepage": "https://github.com/kefeiqian/kqode-cli#readme",
  "bugs": {
    "url": "https://github.com/kefeiqian/kqode-cli/issues"
  },
  "bin": {
    "kqode": "bin/kqode.cjs"
  },
  "files": [
    "bin/",
    "lib/",
    "README.md"
  ],
  "scripts": {
    "postinstall": "node lib/install.cjs",
    "test": "node --test"
  },
  "engines": {
    "node": ">=18"
  }
}
```

## 为什么选择单 npm 包

常见替代方案是发布一个主包，再用 `optionalDependencies` 引用 `@kqode/kqode-darwin-arm64`、`@kqode/kqode-linux-x64` 等平台包。这种方案安装体验很好，但需要为每个 target 管理一个 npm package，发布权限、trusted publisher、版本同步和撤回流程都会成倍增加。

U12 选择单包下载 GitHub Release asset。它的好处是 npm 注册和发布流程最小化，只维护 `@kqode/kqode-cli` 一个 package。代价是安装或首次运行需要访问 GitHub Release，且 `npm install --ignore-scripts` 会跳过 postinstall。

## 为什么首次运行也会下载

[`bin/kqode.cjs`](https://github.com/kefeiqian/KQode/blob/a667e95e4ba1832be0b94fb4fb027cae2f5438ad/packaging/npm/kqode/bin/kqode.cjs) 的 launcher 在执行 binary 前调用 `ensureBinary()`：

```js
let binary;
try {
  binary = await ensureBinary();
} catch (error) {
  console.error(error.message);
  console.error(`kqode: unable to obtain the executable. Download it manually from`);
  console.error(`  https://github.com/${REPO}/releases`);
  process.exit(1);
}

const child = spawn(binary, process.argv.slice(2), { stdio: 'inherit' });
```

这是为了让 `--ignore-scripts` 场景仍然可恢复。postinstall 是优化路径，不是唯一正确路径。如果用户或企业环境禁用了 install scripts，第一次运行 `kqode` 时仍会下载并校验 binary。

## 为什么下载前要校验 SHA-256

[`install.cjs`](https://github.com/kefeiqian/KQode/blob/a667e95e4ba1832be0b94fb4fb027cae2f5438ad/packaging/npm/kqode/lib/install.cjs) 下载 archive 和对应 `.sha256`，然后比较 digest：

```js
const [archive, checksumText] = await Promise.all([
  fetchBuffer(`${base}/${relName}.${ext}`),
  fetchBuffer(`${base}/${relName}.sha256`).then((buf) => buf.toString('utf8'))
]);

const expected = checksumText.trim().split(/\s+/)[0];
const actual = sha256(archive);
if (expected !== actual) {
  throw new Error(
    `@kqode/kqode-cli: checksum mismatch for ${relName}.${ext} (expected ${expected}, got ${actual}).`
  );
}
```

npm 包下载的是 GitHub Release 上的二进制文件，校验 checksum 能防止损坏下载、错误 asset 或中间流程误传。它不是完整签名体系，但对 v0.1.0 的 thin installer 来说，是发布可信度的必要底线。
