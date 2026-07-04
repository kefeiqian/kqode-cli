---
sidebar_position: 2
title: 2. npm 平台包解析模型
---

这一篇看 [`40a3db5c`](https://github.com/kefeiqian/KQode/commit/40a3db5c)。它把 npm 分发模型从“launcher 自己下载二进制”改成“launcher 解析 npm 已经安装好的平台包”。这是 v0.1.3 的核心设计变化。

## 问题：install script 下载二进制看似简单，实际很脆

早期方案可以让 `@kqode/kqode-cli` 在安装时根据平台下载 GitHub Release archive。好处是只发布一个 npm 包；坏处是安装成功依赖两个外部系统同时稳定：npm registry 和 GitHub Release 下载。用户在公司代理、离线缓存、registry mirror、`--ignore-scripts`、Windows 杀软扫描等环境里，都会把“安装 npm 包”变成“安装 npm 包 + 执行脚本 + 访问 GitHub + 解压二进制”。

v0.1.3 选择把复杂度前移到发布端：发布者一次性生成并发布五个平台包；用户安装时只让 npm 做它擅长的事，也就是根据 `os` / `cpu` 选择 optional dependency。这样牺牲的是发布端包数量，换来的是用户端可预测性。

![npm launcher 通过 optionalDependencies 定位平台包](../images/v0-1-3-npm-resolution/optional-dependencies-resolution.png)

## launcher package.json：平台包 pin 是安装契约

[`packaging/npm/kqode/package.json`](https://github.com/kefeiqian/KQode/blob/40a3db5c/packaging/npm/kqode/package.json) 在 `40a3db5c` 中明确列出每个目标平台包：

```json
"optionalDependencies": {
  "@kqode/kqode-cli-darwin-arm64": "0.1.2",
  "@kqode/kqode-cli-linux-arm64": "0.1.2",
  "@kqode/kqode-cli-linux-x64": "0.1.2",
  "@kqode/kqode-cli-win32-arm64": "0.1.2",
  "@kqode/kqode-cli-win32-x64": "0.1.2"
}
```

这里的关键不是“列了五个依赖”，而是它们是 `optionalDependencies`。npm 会读取每个平台包自己的 `os` / `cpu` 字段，只安装当前 host 匹配的那个。launcher 本身不需要知道 npm 的筛选细节；它只需要在运行时解析“理论上应该被安装的那个 package”。

为什么要 pin 到同一个版本？因为平台包携带的是某个 release 的二进制。launcher `0.1.3` 如果错误地指向平台包 `0.1.2`，用户执行 `kqode --version` 时看到的就可能不是 package version。更严重的是，CLI 协议或 embedded backend 发生兼容变化时，launcher 和平台 binary 可能错配。所以版本 pin 不是 cosmetic metadata，而是运行时一致性边界。

## SUPPORTED_TARGETS：一个列表服务三个场景

[`packaging/npm/kqode/lib/resolve.cjs`](https://github.com/kefeiqian/KQode/blob/40a3db5c/packaging/npm/kqode/lib/resolve.cjs) 把目标平台集中到 `SUPPORTED_TARGETS`：

```js
const SUPPORTED_TARGETS = [
  'darwin-arm64',
  'linux-arm64',
  'linux-x64',
  'win32-arm64',
  'win32-x64'
];
```

这个列表同时服务三类逻辑：运行时判断 host 是否受支持、生成器遍历要产出的平台包、CI 校验生成数量。为什么不在 workflow 里手写 `5`？因为目标列表未来一定会变化：可能新增 `darwin-x64`，也可能暂时下线某个 runner。如果运行时代码和 CI 数量检查不共用事实来源，最容易出现“代码支持六个目标，CI 仍然期待五个包”的发布事故。

同一个文件还保留了 `win32-arm64`。这不是说已经有 Windows ARM64 原生二进制，而是 npm 分发模型需要一个安装入口：

```js
/**
 * Supported `${process.platform}-${process.arch}` targets. Each maps 1:1 to a
 * platform package `@kqode/kqode-cli-<platform>-<arch>` listed under the
 * launcher's `optionalDependencies`; npm installs only the one whose `os`/`cpu`
 * matches the host, so the binary ships with `npm install` — no download.
 *
 * `win32-arm64` has no native build yet: its platform package carries the
 * `win32-x64` executable, which Windows 11 on ARM runs via x64 emulation.
 */
```

这个取舍很务实：npm host key 需要覆盖 Windows ARM64 用户，否则他们会直接 unsupported；但真正的 release archive 暂时复用 `windows-x64`。这个映射被放在生成器侧，而不是 runtime 侧，避免 launcher 运行时再处理“这个平台包里其实是什么 binary”的额外知识。

## locate.cjs：用 require.resolve 找 package，而不是猜路径

[`packaging/npm/kqode/lib/locate.cjs`](https://github.com/kefeiqian/KQode/blob/40a3db5c/packaging/npm/kqode/lib/locate.cjs) 负责把 host 变成实际可执行文件路径：

```js
const pkg = platformPackageName(platform, arch);
let manifest;
try {
  manifest = require.resolve(`${pkg}/package.json`);
} catch (cause) {
  const exportsHidden = cause && cause.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED';
  const error = tagged(
    exportsHidden
      ? `${MAIN_PACKAGE}: the platform package ${pkg} is installed but hides its executable behind "exports".`
      : `${MAIN_PACKAGE}: the platform package ${pkg} is not installed.`,
    exportsHidden ? 'KQODE_PACKAGE_EXPORTS' : 'KQODE_MISSING_PACKAGE'
  );
  error.pkg = pkg;
  error.cause = cause;
  throw error;
}
return path.join(path.dirname(manifest), binaryName(platform));
```

这里选择 ``require.resolve(`${pkg}/package.json`)``，而不是手写 `node_modules/@kqode/...` 路径，是为了尊重 Node / npm 的实际解析模型。全局安装、workspace、pnpm store、Yarn PnP 都可能改变物理布局。只要 package 能被 Node 解析到，launcher 就不需要关心它在哪个目录。

同时，代码把 `ERR_PACKAGE_PATH_NOT_EXPORTED` 和 missing package 区分开。这个细节很重要：如果平台包将来错误地添加 restrictive `exports`，用户机器上其实有包，只是 `package.json` 被隐藏。把它误报成“没安装 optional dependency”，会让用户反复 reinstall，却永远修不好真正的 packaging bug。

## bin/kqode.cjs：只做进程转发

[`packaging/npm/kqode/bin/kqode.cjs`](https://github.com/kefeiqian/KQode/blob/40a3db5c/packaging/npm/kqode/bin/kqode.cjs) 是很薄的 launcher：

```js
const child = spawn(binary, process.argv.slice(2), { stdio: 'inherit' });
child.on('error', (error) => {
  console.error(`kqode: failed to launch ${binary}: ${error.message}`);
  process.exit(1);
});
child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code === null ? 1 : code);
  }
});
```

这个文件不理解 KQode 协议、不解析业务 flags、不下载文件，只负责把 argv、stdio、exit code / signal 交给真实 binary。这样设计的原因是减少 launcher 和 TUI 的行为分叉：用户以 npm 方式运行和直接运行 Release binary，最终都进入同一个 packaged Bun / Ink executable。

## 为什么保留 KQODE_BINARY_PATH

`locate.cjs` 仍支持 `KQODE_BINARY_PATH`。这不是主要安装路径，而是救援路径：当 optional dependency 被企业镜像裁剪、包管理器 bug 或用户想手工验证某个 Release binary 时，可以显式指定 binary。主路径越自动，debug escape hatch 越应该清晰。这里用环境变量而不是额外 CLI flag，也避免和真正的 KQode CLI flags 抢命名空间。
