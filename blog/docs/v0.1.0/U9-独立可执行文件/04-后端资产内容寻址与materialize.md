---
sidebar_position: 4
title: 4. 后端资产的内容寻址与 materialize
---

packaged `kqode` 不能直接从内存 `spawn` Rust binary，必须先写到磁盘。U9 新增 [`materializePackagedBackend`](https://github.com/kefeiqian/KQode/blob/f642fb3b65bad29da3497d77967af741424205ca/tui/src/backend/packaged/materializeBackend.ts)。

```ts
const { runtimeDir, binaryPath } = resolvePackagedBackendPaths({
  version,
  sha256: asset.sha256,
  cacheBaseDir,
  platform
});

if (inspectExisting(binaryPath, asset.sha256, platform) === 'reusable') {
  return binaryPath;
}
```

![backend asset materialize 到用户缓存目录](../../images/u9-standalone-executable/materialize-backend-cache.png)

路径由 [`backendCacheDir.ts`](https://github.com/kefeiqian/KQode/blob/f642fb3b65bad29da3497d77967af741424205ca/tui/src/backend/packaged/backendCacheDir.ts) 计算：

```ts
export const KQODE_HOME_DIRNAME = '.kqcode';
export const BACKENDS_DIRNAME = 'backends';
export const PACKAGED_BACKEND_BASENAME = 'kqode-backend';

const runtimeDir = path.join(cacheBaseDir, BACKENDS_DIRNAME, version, sha256);
return { runtimeDir, binaryPath: path.join(runtimeDir, packagedBackendBinaryName(platform)) };
```

也就是默认写到 `~/.kqcode/backends/<version>/<sha256>/kqode-backend[.exe]`。

为什么要内容寻址？第一，不同版本可以并存；第二，同一版本但 backend 内容不同也不会互相覆盖；第三，已验证 binary 可以复用；第四，路径本身就是排查线索。最朴素的固定路径会让新 executable 覆盖旧 backend，尤其在 Windows 上还可能遇到正在运行的文件锁。

materialize 前会验证 embedded bytes：

```ts
const bytes = await asset.readBytes();
const actualSha = sha256Hex(bytes);
if (actualSha !== asset.sha256) {
  throw materializationError(
    `embedded asset integrity check failed (expected ${asset.sha256}, got ${actualSha})`
  );
}
```

失败时 U9 选择 fail closed，不 fallback 到 source mode。原因是 standalone 用户路径的承诺就是启动内嵌且验证过的 backend；如果悄悄改用 Cargo，开发机可能能跑，用户机器却失败，还会掩盖 artifact 损坏。
